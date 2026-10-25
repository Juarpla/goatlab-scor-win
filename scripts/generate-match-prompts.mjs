import { readContentSelection } from '../src/lib/content-selection.js';
if (process.env.MEDIA_ROLE === 'consumer') throw new Error('La producción de prompts pertenece a GitHub Actions');
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { CONTENT_CATEGORIES, CONTENT_PROVIDER_ORDER, promptErrors, validateContent, contentIdentityErrors } from '../src/lib/match-content.js';
import { CONTENT_LLM_LIMITS, withFailover, extractJson } from '../src/lib/llm.js';
import { esName } from '../src/lib/teams.js';
import { editingFacts } from '../src/lib/match-facts.js';
import { TOP_FILENAME, contentMatches, defaultTopN, registerExtra, topFreshness } from '../src/lib/top.js';
import { buildPruneContext, resolvePruneMatch, pruneDue } from '../src/lib/pruning.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a, true] : [a.slice(0, i), a.slice(i + 1)]; }));
const category = args['--category'];
const spec = CONTENT_CATEGORIES[category];
if (!spec?.kinds) throw new Error('Usa --category=image-prompts|video-prompts');
process.env.SCRIPT_PROVIDER_ORDER ||= CONTENT_PROVIDER_ORDER;
const { fixtures, top: selectedTop } = await readContentSelection();
const onlyMatch = args['--match'];
const now = Date.now();
let ledger = null;
try { ledger = JSON.parse(await readFile('public/data/finished-at.json', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
const pruneContext = buildPruneContext(fixtures.matches ?? [], ledger);
const requested = onlyMatch ? resolvePruneMatch(onlyMatch, pruneContext) : null;
const protectedId = onlyMatch ? (requested?.webId ?? requested?.id ?? onlyMatch) : null;
const limitRaw = args['--limit'];
const topDefault = defaultTopN(process.env);
const topRaw = args['--match'] ? null : (args['--top'] || process.env.SCRIPT_TOP_N);
const top = onlyMatch ? null : (Number.isFinite(Number(topRaw)) && Number(topRaw) >= 1 ? Math.floor(Number(topRaw)) : topDefault);
const manualTop = top != null && topRaw != null && String(topRaw).trim() !== '' && top > topDefault;
const dir = `public/data/${spec.directory}`;
await mkdir(dir, { recursive: true });
let topFile = selectedTop;
const freshness = topFreshness(topFile, { now, env: process.env, manual: !!onlyMatch });
if (!freshness.valid) {
  console.error(`${category}: top.json rechazado (${freshness.reason})`);
  process.exit(2);
}
async function saveTopFile() {
  await writeFile(`public/data/${TOP_FILENAME}`, JSON.stringify(topFile, null, 2));
}
let matches;
if (onlyMatch) {
  matches = contentMatches(topFile, fixtures.matches, { onlyMatch });
  if (!matches.length && requested) matches = [requested];
  // --match manual: también vale para un partido ya jugado (FT) que haga falta rehacer.
  if (!matches.length) matches = (fixtures.matches ?? []).filter(m => m.id === onlyMatch || m.webId === onlyMatch);
  if (!matches.length) {
    try {
      const s = JSON.parse(await readFile(`public/data/youtube-scripts/${onlyMatch}.json`, 'utf8'));
      matches = [{ id: onlyMatch, webId: onlyMatch, home: s.home, away: s.away, competition: s.competition ?? null, kickoff: s.kickoff ?? null }];
      console.log(`${category}: ${onlyMatch} fuera de fixtures; identidad del guión`);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  const registered = registerExtra(topFile ?? { ranking: [], extra: [] }, [...(matches.length ? [protectedId] : [])]);
  if (registered.added.length && !process.env.CONTENT_SELECTION_FILE) {
    topFile = registered.top;
    await saveTopFile();
    console.log(`${category}: extra manual ${registered.added.join(', ')}`);
  }
} else {
  if (process.env.CONTENT_AUTOMATIC !== '1' && manualTop) {
    const registered = registerExtra(topFile ?? { ranking: [], extra: [] }, (topFile.ranking ?? []).slice(topDefault, top).map(m => m.id));
    if (registered.added.length && !process.env.CONTENT_SELECTION_FILE) {
      topFile = registered.top;
      await saveTopFile();
      console.log(`${category}: extras manuales ${registered.added.join(', ')}`);
    }
  }
  matches = contentMatches(topFile, fixtures.matches, { automatic: process.env.CONTENT_AUTOMATIC === '1', n: top, limit: limitRaw, now });
}
if (!onlyMatch && process.env.CONTENT_AUTOMATIC !== '1') matches = matches.filter(match => !pruneDue(match, pruneContext.seen, now));
if (!matches.length) {
  console.log(`${category}: sin partidos para generar`);
  process.exit(0);
}
const published = JSON.parse(await readFile('public/data/evaluation-report.json', 'utf8')).published === true;
let scorers; try { scorers = JSON.parse(await readFile('public/data/scorers.json', 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const guide = await readFile(`scripts/prompts/${category}.md`, 'utf8');
const instructionVersion = createHash('sha256').update(guide).digest('hex');
let failed = 0;
for (const match of matches) {
  const matchId = match.webId ?? match.id, file = `${dir}/${matchId}.json`;
  try {
    const old = JSON.parse(await readFile(file, 'utf8'));
    if (!args['--force'] && validateContent(old, category, matchId) && !contentIdentityErrors(old, match).length) { console.log(`${category}: ${matchId} ya existe`); continue; }
  } catch (e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
  const home = esName(match.home), away = esName(match.away);
  const facts = editingFacts(match, scorers);
  const identity = { matchId, home, away, competition: match.competition, kickoff: match.kickoff, venue: match.venue ?? null, facts, published, kinds: spec.kinds };
  let result, error;
  console.log(`${category}: preparando ${matchId}`);
  try {
    result = await withFailover([{ role: 'system', content: guide }, { role: 'user', content: JSON.stringify(identity) }], {
      orderVar: 'SCRIPT_PROVIDER_ORDER', ...CONTENT_LLM_LIMITS,
      validate: text => {
        const draft = extractJson(text);
        const errors = promptErrors(draft, { category, home, away, facts, published });
        if (errors.length) throw new Error(errors.slice(0, 8).join('; '));
        return draft;
      },
    });
    const payload = { version: 1, category, ...identity, instructionVersion, author: { provider: result.provider, model: result.model }, generatedAt: new Date().toISOString(), prompts: result.value.prompts };
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(payload, null, 2), { flag: 'wx' });
      await rename(temporary, file);
    } finally { await rm(temporary, { force: true }); }
    console.log(`${category}: ${matchId} por ${result.provider}/${result.model}`);
  } catch (e) { error = e; failed++; console.error(`${category}: ${matchId}: ${e.message}`); }
  const healthPath = 'public/data/llm-health.json';
  let health; try { health = JSON.parse(await readFile(healthPath, 'utf8')); } catch { health = { runs: [] }; }
  health.runs = [...(health.runs ?? []), { at: new Date().toISOString(), task: category, matchId, instructionVersion, ok: result ? { provider: result.provider, model: result.model } : null, failures: result?.failures ?? error?.details ?? [], usage: result?.usage ?? null }].slice(-200);
  health.updatedAt = new Date().toISOString();
  await writeFile(healthPath, JSON.stringify(health, null, 2));
}
process.exitCode = failed ? 1 : 0;
