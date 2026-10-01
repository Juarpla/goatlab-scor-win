/** Guiones faltantes de Shorts: el modelo de turno redacta con el skill
 *  redactar-guiones-shorts. Un JSON ya existente no se toca.
 *  Sin --match, redacta el top N (SCRIPT_TOP_N o 5) del ranking de relevancia.
 *  En corrida completa (sin --match/--limit) poda además los JSONs rancios
 *  cuyo partido ya salió de fixtures, mirando todos los NS, no solo el top. */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createProviderBreaker, extractJson, hasTransportFailure, hasTruncatedFailure, withFailover } from '../src/lib/llm.js';
import {
  acceptYoutubeDraft,
  buildDescription,
  cleanLede,
  attentionPlayers,
  playersInNarration,
  shortTitle,
  countWords,
  missingScripts,
  scriptFacts,
  selectMatches,
  staleScripts,
  youtubeUserPayload,
} from '../src/lib/youtube.js';
import { esName } from '../src/lib/teams.js';
import { checkDescription } from '../src/lib/compliance.js';

const dir = 'public/data/youtube-scripts';
const healthPath = 'public/data/llm-health.json';
const skillPath = '.agents/skills/redactar-guiones-shorts/SKILL.md';
const SCRIPT_MAX_TOKENS = 12_000;
const SCRIPT_TIMEOUT_MS = 180_000;
const LLM_HEALTH_MAX = 200;
const args = new Map(process.argv.slice(2).map(a => a.split('=')));
const onlyMatch = args.get('--match');
const limitRaw = args.get('--limit');
const force = args.has('--force');
const fullRun = !onlyMatch && limitRaw == null && !force;
function positiveInt(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}
const top = onlyMatch ? null : (positiveInt(args.has('--top') ? args.get('--top') : process.env.SCRIPT_TOP_N) ?? 5);

const fixtures = JSON.parse(await readFile('public/data/fixtures.json', 'utf8'));
const evaluation = JSON.parse(await readFile('public/data/evaluation-report.json', 'utf8'));
let scorers = null;
try {
  scorers = JSON.parse(await readFile('public/data/scorers.json', 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const published = evaluation?.published === true;
const skill = (await readFile(skillPath, 'utf8')).replace(/^---\n[\s\S]*?\n---\n*/, '').trim();

const allNs = selectMatches(fixtures.matches, {});
let matches = selectMatches(fixtures.matches, { onlyMatch, limit: limitRaw, top });
if (top != null) console.log(`shorts: top ${top} de ${allNs.length} partidos NS`);
if (!matches.length) {
  console.error('shorts: sin partidos NS para generar');
  process.exit(1);
}

await mkdir(dir, { recursive: true });
if (fullRun) {
  const live = allNs.map(m => m.webId ?? m.id);
  for (const file of staleScripts(await readdir(dir), live)) {
    await rm(join(dir, file));
    console.log(`shorts: poda ${file}`);
  }
}

const names = (await readdir(dir)).filter(f => f.endsWith('.json'));
const pending = force ? matches : missingScripts(matches, names);
let failures = 0;
let written = 0;
const skipped = force ? 0 : matches.length - pending.length;
if (!pending.length) {
  console.log(`shorts: ${skipped} ya redactados, 0 faltantes`);
  process.exit(0);
}
if (force) console.log(`shorts: reescritura forzada de ${pending.length} partidos`);

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
  const draft = extractJson(content);
  for (const script of draft?.scripts ?? []) {
    const hook = String(script?.hook ?? '').trim();
    const narration = String(script?.narration ?? '').trim();
    if (hook && narration && !narration.startsWith(hook)) {
      script.narration = `${hook} ${narration}`;
    }
  }
  const lede = cleanLede(draft?.lede);
  const home = esName(match.home);
  const away = esName(match.away);
  const numbered = (draft?.scripts ?? []).map((script, i) => ({ ...script, n: i + 1 }));
  const players = attentionPlayers(numbered, { home, away });
  const description = buildDescription({
    lede,
    matchId,
    competition: match.competition,
    home,
    away,
    players,
  });
  const errors = [
    ...acceptYoutubeDraft({ ...draft, lede }, { facts, published }),
    ...checkDescription(description, { matchId }),
  ];
  if (errors.length) throw new Error(errors.slice(0, 8).join('; '));
  const scripts = draft.scripts.map((script, i) => {
    const narration = String(script.narration).trim();
    const hook = String(script.hook).trim();
    const n = i + 1;
    const named = [3, 4, 7, 9].includes(n) ? playersInNarration(narration, { home, away }) : [];
    return { n, hook, title: shortTitle({ home, away, n, hook, players: named }), narration, words: countWords(narration) };
  });
  return { scripts, description };
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
      at: new Date().toISOString(), task: 'shorts', matchId, attempts, failures: priorFailures.slice(0, 8),
      ok: { provider: drafted.provider, model: drafted.model }, usage: drafted.usage, truncated: false, maxTokens: SCRIPT_MAX_TOKENS, batchSize: 1, callId: drafted.callId,
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
    description: value.description,
    home: esName(match.home),
    away: esName(match.away),
    competition: match.competition,
    kickoff: match.kickoff,
    author: { provider, model },
    generatedAt: new Date().toISOString(),
  };
  await writeFile(file, JSON.stringify(payload, null, 2));
  written += 1;
  console.log(`shorts: ${file} redactado por ${provider}/${model}`);
  if (force && pending.length > 1) await new Promise(r => setTimeout(r, 2000));
}

const breaker = createProviderBreaker();
const deferred = [];
let leftForNext = 0;
try {
  for (const match of pending) {
    const matchId = match.webId ?? match.id;
    const facts = scriptFacts(match, scorers);
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
