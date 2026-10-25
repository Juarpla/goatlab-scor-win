import { normalizeScriptTitles } from '../src/lib/script-titles.js';
import { readContentSelection } from '../src/lib/content-selection.js';
if (process.env.MEDIA_ROLE === 'consumer') throw new Error('La producción de guiones pertenece a GitHub Actions');
/** Guiones faltantes de Shorts: el modelo de turno redacta con el skill
 *  redactar-guiones-shorts. Un JSON válido ya existente no se toca.
 *  Sin --match, redacta el top N (input --top, SCRIPT_TOP_N o 5) del ranking
 *  guardado en public/data/top.json (lo escribe 1-update-data). La poda pertenece a la actualización de data.
 *  --match o top ampliado registran el partido como extra protegido. */
import { mkdir, readFile, rm, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { CONTENT_LLM_LIMITS, createProviderBreaker, extractJson, hasTransportFailure, hasTruncatedFailure, withFailover } from '../src/lib/llm.js';
import {
  acceptYoutubeDraft,
  buildDescription,
  cleanLede,
  normalizeYoutubeDraft,
  attentionPlayers,
  playersInNarration,
  playerNames,
  shortTitle,
  countWords,
  scriptFacts,
  selectMatches,
  youtubeUserPayload,
} from '../src/lib/youtube.js';
import { CONTENT_PROVIDER_ORDER, scriptStructureErrors } from '../src/lib/match-content.js';
import { createHash, randomUUID } from 'node:crypto';
import { esName } from '../src/lib/teams.js';
import { TOP_FILENAME, contentMatches, defaultTopN, registerExtra, topFreshness } from '../src/lib/top.js';
import { checkDescription } from '../src/lib/compliance.js';
import { buildPruneContext, resolvePruneMatch, pruneDue } from '../src/lib/pruning.js';

process.env.SCRIPT_PROVIDER_ORDER ||= CONTENT_PROVIDER_ORDER;
const dir = 'public/data/youtube-scripts';
const healthPath = 'public/data/llm-health.json';
const skillPath = '.agents/skills/redactar-guiones-shorts/SKILL.md';
const SCRIPT_MAX_TOKENS = CONTENT_LLM_LIMITS.maxTokens;
const SCRIPT_TIMEOUT_MS = CONTENT_LLM_LIMITS.timeoutMs;
const LLM_HEALTH_MAX = 200;
const args = new Map(process.argv.slice(2).map(a => a.split('=')));
const onlyMatch = args.get('--match');
const limitRaw = args.get('--limit');
const force = args.has('--force');
function positiveInt(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}
const topDefault = defaultTopN(process.env);
const topRaw = args.has('--top') ? args.get('--top') : process.env.SCRIPT_TOP_N;
const top = onlyMatch ? null : (positiveInt(topRaw) ?? topDefault);
const manualTop = top != null && topRaw != null && String(topRaw).trim() !== '' && top > topDefault;

const { fixtures, top: selectedTop } = await readContentSelection();
const now = Date.now();
let ledger = null;
try { ledger = JSON.parse(await readFile('public/data/finished-at.json', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
const pruneContext = buildPruneContext(fixtures.matches ?? [], ledger);
const requested = onlyMatch ? resolvePruneMatch(onlyMatch, pruneContext) : null;
const protectedId = onlyMatch ? (requested?.webId ?? requested?.id ?? onlyMatch) : null;

const allNs = selectMatches(fixtures.matches, {});
await mkdir(dir, { recursive: true });
let topFile = selectedTop;
const freshness = topFreshness(topFile, { now, env: process.env, manual: !!onlyMatch });
if (!freshness.valid) {
  console.error(`shorts: top.json rechazado (${freshness.reason})`);
  process.exit(2);
}
async function saveTopFile() {
  await writeFile(join('public/data', TOP_FILENAME), JSON.stringify(topFile, null, 2));
}
let matches;
if (onlyMatch) {
  matches = contentMatches(topFile, fixtures.matches, { onlyMatch });
  if (!matches.length && requested) matches = [requested];
  const registered = registerExtra(topFile ?? { ranking: [], extra: [] }, [...(matches.length ? [protectedId] : [])]);
  if (registered.added.length && !process.env.CONTENT_SELECTION_FILE) {
    topFile = registered.top;
    await saveTopFile();
    console.log(`shorts: extra manual ${registered.added.join(', ')}`);
  }
} else {
  if (process.env.CONTENT_AUTOMATIC !== '1' && manualTop) {
    const registered = registerExtra(topFile ?? { ranking: [], extra: [] }, (topFile.ranking ?? []).slice(topDefault, top).map(m => m.id));
    if (registered.added.length && !process.env.CONTENT_SELECTION_FILE) {
      topFile = registered.top;
      await saveTopFile();
      console.log(`shorts: extras manuales ${registered.added.join(', ')}`);
    }
  }
  matches = contentMatches(topFile, fixtures.matches, { automatic: process.env.CONTENT_AUTOMATIC === '1', n: top, limit: limitRaw, now });
}
if (process.env.CONTENT_AUTOMATIC === '1') console.log(`shorts: ${matches.length} partidos del top automático (máximo 5) [top.json]`);
else if (top != null) console.log(`shorts: top ${top} de ${allNs.length} partidos NS [top.json]`);
if (!onlyMatch && process.env.CONTENT_AUTOMATIC !== '1') matches = matches.filter(match => !pruneDue(match, pruneContext.seen, now));
if (!matches.length) {
  console.log('shorts: sin partidos NS para generar');
  process.exit(process.env.CONTENT_AUTOMATIC === '1' ? 0 : 1);
}

const pending = [];
for (const match of matches) {
  const matchId = match.webId ?? match.id;
  if (force) { pending.push(match); continue; }
  try {
    const existing = JSON.parse(await readFile(join(dir, `${matchId}.json`), 'utf8'));
    const errors = scriptStructureErrors(existing, { matchId, match });
    if (!errors.length) {
      const normalized = normalizeScriptTitles(existing);
      if (JSON.stringify(normalized.scripts) !== JSON.stringify(existing.scripts)) {
        await writeFile(join(dir, `${matchId}.json`), JSON.stringify(normalized, null, 2));
        console.log(`shorts: ${matchId}: títulos actualizados; narraciones conservadas`);
      }
      continue;
    }
    console.log(`shorts: ${matchId} corrupto; pendiente (${errors.slice(0, 3).join('; ')})`);
  } catch (error) {
    if (error.code !== 'ENOENT') console.log(`shorts: ${matchId} ilegible; pendiente`);
  }
  pending.push(match);
}
let failures = 0;
let written = 0;
const skipped = force ? 0 : matches.length - pending.length;
if (!pending.length) {
  console.log(`shorts: ${skipped} ya redactados, 0 faltantes`);
  process.exit(0);
}
if (force) console.log(`shorts: reescritura forzada de ${pending.length} partidos`);

const evaluation = JSON.parse(await readFile('public/data/evaluation-report.json', 'utf8'));
let scorers = null;
try { scorers = JSON.parse(await readFile('public/data/scorers.json', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const published = evaluation?.published === true;
const skill = (await readFile(skillPath, 'utf8')).replace(/^---\n[\s\S]*?\n---\n*/, '').trim();

const llmHealth = [];
function noteLlmHealth(record) {
  llmHealth.push(record);
  if (llmHealth.length > LLM_HEALTH_MAX) llmHealth.splice(0, llmHealth.length - LLM_HEALTH_MAX);
}
async function writeLlmHealth() {
  if (!llmHealth.length) return;
  let previous = { runs: [] };
  try {
    previous = JSON.parse(await readFile(healthPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const runs = [...(previous.runs ?? []), ...llmHealth].slice(-LLM_HEALTH_MAX);
  await writeFile(healthPath, JSON.stringify({ updatedAt: new Date().toISOString(), runs }, null, 2));
}

function failureDetails(error) {
  const configured = !/No hay proveedores/.test(String(error?.message ?? ''));
  if (Array.isArray(error?.details) && error.details.length) return { configured, details: error.details };
  return {
    configured,
    details: [{ provider: null, model: null, kind: configured ? 'unknown' : 'config', reason: String(error?.message ?? error) }],
  };
}

function validateDraft(content, match, { published, facts, matchId }) {
  const draft = normalizeYoutubeDraft(extractJson(content));
  const lede = cleanLede(draft?.lede);
  const home = esName(match.home);
  const away = esName(match.away);
  const knownPlayers = playerNames(facts);
  const numbered = (draft?.scripts ?? []).map((script, i) => ({ ...script, n: i + 1 }));
  const players = attentionPlayers(numbered, { home, away, knownPlayers });
  const description = buildDescription({
    lede,
    matchId,
    competition: match.competition,
    home,
    away,
    players,
  });
  const errors = [
    ...acceptYoutubeDraft({ ...draft, lede }, { facts, published, editorial: true }),
    ...checkDescription(description, { matchId }),
  ];
  if (errors.length) throw new Error(errors.slice(0, 8).join('; '));
  const scripts = draft.scripts.map((script, i) => {
    const narration = String(script.narration).trim();
    const hook = String(script.hook).trim();
    const n = i + 1;
    const named = [3, 4, 7, 9].includes(n) ? playersInNarration(narration, { home, away, knownPlayers }) : [];
    const entry = { n, hook, title: shortTitle({ home, away, n, hook, players: named }), narration, words: countWords(narration) };
    entry.projection = String(script.projection).trim();
    return entry;
  });
  return { scripts, description, playerNames: knownPlayers };
}

function errorText(error) {
  return (error?.errors?.length ? error.errors.map(String).join('; ') : null) ?? error?.message ?? String(error);
}

/** Transporte o truncado: se reintenta al final del lote, no a los 30 s. */
function retryLater(error) {
  const { configured } = failureDetails(error);
  return configured && (hasTransportFailure(error) || hasTruncatedFailure(error));
}

/** Una llamada por partido. `deferTransport` aparta timeout, 429 y truncado para el cierre del lote. */
async function draftMatch(match, { breaker, skill, published, facts, priorFailures = [], deferTransport = false }) {
  breaker.reset();
  const matchId = match.webId ?? match.id;
  const attempts = priorFailures.length ? 2 : 1;
  const messages = [
    { role: 'system', content: skill },
    { role: 'user', content: `Redacta los 10 guiones de este partido. Responde solo el JSON.\n${JSON.stringify(youtubeUserPayload({ published, facts }))}` },
  ];
  try {
    const drafted = await withFailover(messages, {
      maxTokens: SCRIPT_MAX_TOKENS,
      timeoutMs: SCRIPT_TIMEOUT_MS,
      breaker,
      orderVar: 'SCRIPT_PROVIDER_ORDER',
      validate: content => validateDraft(content, match, { published, facts, matchId }),
    });
    noteLlmHealth({
      at: new Date().toISOString(), task: 'shorts', matchId, attempts, failures: [...priorFailures, ...(drafted.failures ?? [])].slice(0, 8),
      ok: { provider: drafted.provider, model: drafted.model, latencyMs: drafted.latencyMs }, usage: drafted.usage, truncated: false, maxTokens: SCRIPT_MAX_TOKENS, batchSize: 1, callId: drafted.callId,
    });
    return drafted;
  } catch (error) {
    const { details } = failureDetails(error);
    const all = [...priorFailures, ...details];
    if (deferTransport && retryLater(error)) {
      error.priorFailures = all;
      throw error;
    }
    const usage = [...all].reverse().find(detail => detail.usage)?.usage ?? null;
    noteLlmHealth({
      at: new Date().toISOString(), task: 'shorts', matchId, attempts, failures: all.slice(0, 8),
      ok: null, usage, truncated: all.some(failure => failure.truncated), maxTokens: SCRIPT_MAX_TOKENS, batchSize: 1, callId: null,
    });
    throw error;
  }
}

async function saveDraft(match, drafted) {
  const matchId = match.webId ?? match.id;
  const file = join(dir, `${matchId}.json`);
  const { value, provider, model } = drafted;
  const payload = {
    matchId,
    providerId: match.id,
    scripts: value.scripts,
    playerNames: value.playerNames,
    description: value.description,
    home: esName(match.home),
    away: esName(match.away),
    competition: match.competition,
    kickoff: match.kickoff,
    author: { provider, model },
    editorialVersion: 2,
    instructionVersion: createHash('sha256').update(skill).digest('hex'),
    generatedAt: new Date().toISOString(),
  };
  const errors = scriptStructureErrors(payload, { matchId, match });
  if (errors.length) throw new Error(`guion persistido inválido: ${errors.slice(0, 3).join('; ')}`);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(payload, null, 2), { flag: 'wx' });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
  written += 1;
  console.log(`shorts: ${file} redactado por ${provider}/${model}`);
  if (force && pending.length > 1) await new Promise(r => setTimeout(r, 2000));
}

const breaker = createProviderBreaker();
const deferred = [];
let leftForNext = 0;
/** Probabilidades del partido para el pick (null si no hay archivo).
 *  Vive en public/match-probabilities (trackeado, la misma llave que la
 *  página del partido), no en public/data (artefacto local). */
async function loadProbability(matchId) {
  const file = join('public/match-probabilities', `${matchId}.json`);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    console.warn(`shorts: sin probabilidades para ${matchId} (${error.code ?? 'JSON inválido'}); pick sin cálculo`);
    return null;
  }
}
try {
  for (const match of pending) {
    const matchId = match.webId ?? match.id;
    const facts = scriptFacts(match, scorers, await loadProbability(match.id));
    console.log(`shorts: ${matchId} picks ${facts.picks.filter(pick => pick).length}/10`);
    const file = join(dir, `${matchId}.json`);
    try {
      const drafted = await draftMatch(match, { breaker, skill, published, facts, deferTransport: true });
      await saveDraft(match, drafted);
    } catch (error) {
      if (retryLater(error)) {
        console.warn(`shorts: fallo reintentable para ${matchId}; reintento al final del lote. ${errorText(error)}`);
        deferred.push({ match, facts, priorFailures: error.priorFailures ?? failureDetails(error).details });
        continue;
      }
      failures += 1;
      console.error(`shorts: ${file}: ${error.message}`);
    }
  }
  for (const item of deferred) {
    const matchId = item.match.webId ?? item.match.id;
    try {
      const drafted = await draftMatch(item.match, {
        breaker, skill, published, facts: item.facts, priorFailures: item.priorFailures,
      });
      await saveDraft(item.match, drafted);
    } catch (error) {
      leftForNext += 1;
      console.error(`shorts: ${matchId} queda para la siguiente corrida. ${errorText(error)}`);
    }
  }
} finally {
  await writeLlmHealth();
}
const leftNote = leftForNext ? `, ${leftForNext} para la siguiente` : '';
console.log(`shorts: ${written} redactados, ${skipped} ya existían, ${failures} fallos${leftNote}`);
process.exit(failures ? 1 : 0);
