/** Guiones faltantes de Shorts: el modelo de turno redacta con el skill
 *  redactar-guiones-shorts. Un JSON ya existente no se toca.
 *  En corrida completa (sin --match/--limit) poda además los JSONs rancios
 *  cuyo partido ya salió de fixtures. */
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
const sleepWithJitter = (baseMs, jitterMs = 0) => new Promise(resolve => setTimeout(resolve, baseMs + Math.floor(Math.random() * Math.max(0, jitterMs))));
const args = new Map(process.argv.slice(2).map(a => a.split('=')));
const onlyMatch = args.get('--match');
const limitRaw = args.get('--limit');
const force = args.has('--force');
const fullRun = !onlyMatch && limitRaw == null && !force;

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

let matches = selectMatches(fixtures.matches, { onlyMatch, limit: limitRaw });
if (!matches.length) {
  console.error('shorts: sin partidos NS para generar');
  process.exit(1);
}

await mkdir(dir, { recursive: true });
if (fullRun) {
  const live = matches.map(m => m.webId ?? m.id);
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

/** Una llamada por partido. Segundo intento solo si la cadena falló por transporte o truncado. */
async function draftMatch(match, { breaker, skill, published, facts }) {
  breaker.reset();
  const matchId = match.webId ?? match.id;
  const messages = [
    { role: 'system', content: skill },
    { role: 'user', content: `Sigue el procedimiento. Cada narración es un solo párrafo corrido, menos de 50 s, con prosa hablada. Copia nombres y cifras de equipos de este objeto; en guiones 3, 4, 7 y 9 usa tu conocimiento reciente de jugadores si hace falta. No escribas title ni hashtags: al guardar se estampan las frases de clic del skill. Responde solo el JSON de 10 guiones.\n${JSON.stringify(youtubeUserPayload({ published, facts }))}` },
  ];
  const failures = [];
  let madeAttempts = 0;
  let usage = null;
  let callId = null;
  while (madeAttempts < 2) {
    madeAttempts += 1;
    try {
      const drafted = await withFailover(messages, {
        maxTokens: SCRIPT_MAX_TOKENS,
        timeoutMs: SCRIPT_TIMEOUT_MS,
        breaker,
        validate: content => validateDraft(content, match, { published, facts, matchId }),
      });
      usage = drafted.usage;
      callId = drafted.callId;
      noteLlmHealth({
        at: new Date().toISOString(), task: 'shorts', matchId, attempts: madeAttempts, failures: failures.slice(0, 8),
        ok: { provider: drafted.provider, model: drafted.model }, usage, truncated: false, maxTokens: SCRIPT_MAX_TOKENS, batchSize: 1, callId,
      });
      return drafted;
    } catch (error) {
      const { configured, details } = failureDetails(error);
      failures.push(...details);
      usage = [...details].reverse().find(detail => detail.usage)?.usage ?? usage;
      const detail = (error?.errors?.length ? error.errors.map(String).join('; ') : null) ?? error?.message ?? String(error);
      if (madeAttempts === 1 && configured && (hasTransportFailure(error) || hasTruncatedFailure(error))) {
        console.warn(`shorts: fallo reintentable para ${matchId}; reintento en ~30s. ${detail}`);
        await sleepWithJitter(30_000, 10_000);
        continue;
      }
      noteLlmHealth({
        at: new Date().toISOString(), task: 'shorts', matchId, attempts: madeAttempts, failures: failures.slice(0, 8),
        ok: null, usage, truncated: failures.some(failure => failure.truncated), maxTokens: SCRIPT_MAX_TOKENS, batchSize: 1, callId,
      });
      throw error;
    }
  }
}

const breaker = createProviderBreaker();
try {
  for (const match of pending) {
    const matchId = match.webId ?? match.id;
    const facts = scriptFacts(match, scorers);
    const file = join(dir, `${matchId}.json`);
    try {
      const { value, provider, model } = await draftMatch(match, { breaker, skill, published, facts });
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
    } catch (error) {
      failures += 1;
      console.error(`shorts: ${file}: ${error.message}`);
    }
  }
} finally {
  await writeLlmHealth();
}
console.log(`shorts: ${written} redactados, ${skipped} ya existían, ${failures} fallos`);
process.exit(failures ? 1 : 0);
