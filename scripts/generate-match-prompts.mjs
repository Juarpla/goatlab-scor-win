import { readFile, readdir, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CONTENT_CATEGORIES, CONTENT_PROVIDER_ORDER, promptErrors, validateContent } from '../src/lib/match-content.js';
import { withFailover, extractJson } from '../src/lib/llm.js';
import { selectMatches } from '../src/lib/youtube.js';
import { editingFacts } from '../src/lib/match-facts.js';
import { esName } from '../src/lib/teams.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a, true] : [a.slice(0, i), a.slice(i + 1)]; }));
const category = args['--category'];
const spec = CONTENT_CATEGORIES[category];
if (!spec?.kinds) throw new Error('Usa --category=image-prompts|video-prompts|motion-prompts');
process.env.SCRIPT_PROVIDER_ORDER ||= CONTENT_PROVIDER_ORDER;
const fixtures = JSON.parse(await readFile('public/data/fixtures.json', 'utf8'));
const published = JSON.parse(await readFile('public/data/evaluation-report.json', 'utf8')).published === true;
let scorers; try { scorers = JSON.parse(await readFile('public/data/scorers.json', 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const guide = await readFile(`scripts/prompts/${category}.md`, 'utf8');
const instructionVersion = createHash('sha256').update(guide).digest('hex');
const dir = `public/data/${spec.directory}`;
await mkdir(dir, { recursive: true });
const all = selectMatches(fixtures.matches, {});
const matches = selectMatches(args['--match'] ? fixtures.matches : fixtures.matches.filter(m => Date.parse(m.kickoff) > Date.now()), { onlyMatch: args['--match'], limit: args['--limit'], top: args['--match'] ? null : args['--top'] || process.env.SCRIPT_TOP_N || 5 });
if (!args['--match'] && !args['--force'] && !args['--limit']) {
  const live = new Set(all.map(m => `${m.webId ?? m.id}.json`));
  for (const name of await readdir(dir)) if (name.endsWith('.json') && !live.has(name)) await rm(`${dir}/${name}`);
}
let failed = 0;
for (const match of matches) {
  const matchId = match.webId ?? match.id, file = `${dir}/${matchId}.json`;
  try {
    const old = JSON.parse(await readFile(file, 'utf8'));
    if (!args['--force'] && validateContent(old, category, matchId)) { console.log(`${category}: ${matchId} ya existe`); continue; }
  } catch (e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
  const home = esName(match.home), away = esName(match.away);
  const facts = editingFacts(match, scorers);
  const identity = { matchId, home, away, competition: match.competition, kickoff: match.kickoff, venue: match.venue ?? null, facts, published, kinds: spec.kinds };
  const validationHints = category === 'motion-prompts' ? {
    allowedFactIds: facts.map(f => f.id),
    references: 'Use exact catalog IDs, e.g. {{home.wins}}, never {{fact.home.wins}}. factIds must list exactly the unique IDs actually used in prompt text, not all available IDs. No placeholders for team names, source, sample, timing or labels unless their exact ID exists in the catalog.',
    presentations: 'Each entry needs presentations: ["editorial","statistical"] and both named variants in its prompt text. Never write % or percent even for layout when published=false.',
  } : undefined;
  let result, error;
  console.log(`${category}: preparando ${matchId}`);
  try {
    result = await withFailover([{ role: 'system', content: guide }, { role: 'user', content: JSON.stringify({ ...identity, validationHints }) }], {
      orderVar: 'SCRIPT_PROVIDER_ORDER', maxTokens: 12000, timeoutMs: 180000,
      validate: text => {
        const draft = extractJson(text);
        const errors = promptErrors(draft, { category, home, away, facts, published });
        if (category === 'motion-prompts' && !draft.prompts?.every(p => Array.isArray(p.presentations) && p.presentations.join(',') === 'editorial,statistical')) errors.push('Cada Motion Prompt requiere las dos presentaciones');
        if (errors.length) throw new Error(errors.slice(0, 8).join('; '));
        return draft;
      },
    });
    const payload = { version: 1, category, ...identity, instructionVersion, author: { provider: result.provider, model: result.model }, generatedAt: new Date().toISOString(), prompts: result.value.prompts };
    await writeFile(`${file}.tmp`, JSON.stringify(payload, null, 2));
    await rename(`${file}.tmp`, file);
    console.log(`${category}: ${matchId} por ${result.provider}/${result.model}`);
  } catch (e) { error = e; failed++; console.error(`${category}: ${matchId}: ${e.message}`); }
  const healthPath = 'public/data/llm-health.json';
  let health; try { health = JSON.parse(await readFile(healthPath, 'utf8')); } catch { health = { runs: [] }; }
  health.runs = [...(health.runs ?? []), { at: new Date().toISOString(), task: category, matchId, instructionVersion, ok: result ? { provider: result.provider, model: result.model } : null, failures: result?.failures ?? error?.details ?? [], usage: result?.usage ?? null }].slice(-200);
  health.updatedAt = new Date().toISOString();
  await writeFile(healthPath, JSON.stringify(health, null, 2));
}
process.exitCode = failed ? 1 : 0;
