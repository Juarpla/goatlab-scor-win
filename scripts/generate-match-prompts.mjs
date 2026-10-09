import { readFile, readdir, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { CONTENT_CATEGORIES, CONTENT_PROVIDER_ORDER, promptErrors, validateContent, contentIdentityErrors } from '../src/lib/match-content.js';
import { withFailover, extractJson, createProviderBreaker } from '../src/lib/llm.js';
import { selectMatches } from '../src/lib/youtube.js';
import { rankMatches, esName } from '../src/lib/teams.js';
import { editingFacts } from '../src/lib/match-facts.js';
import { TOP_FILENAME, defaultTopN, effectiveIds, registerExtra, topFreshness } from '../src/lib/top.js';
import { buildPruneContext, resolvePruneMatch, pruneDue } from '../src/lib/pruning.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a, true] : [a.slice(0, i), a.slice(i + 1)]; }));
const category = args['--category'];
const spec = CONTENT_CATEGORIES[category];
if (!spec?.kinds) throw new Error('Usa --category=image-prompts|video-prompts|motion-prompts');
process.env.SCRIPT_PROVIDER_ORDER ||= CONTENT_PROVIDER_ORDER;
process.env.MOTION_PROVIDER_ORDER ||= 'OPENCODE_GO_MODEL,OPENCODE_GO_FALLBACK_MODEL,MISTRAL_MODEL,WORKERS_AI_MODEL';
const fixtures = JSON.parse(await readFile('public/data/fixtures.json', 'utf8'));
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
const futureNs = (fixtures.matches ?? []).filter(m => m?.status === 'NS' && Date.parse(m.kickoff) > now);
const liveRanked = rankMatches(futureNs).map(m => m.webId ?? m.id);
const dir = `public/data/${spec.directory}`;
await mkdir(dir, { recursive: true });
for (const name of await readdir(dir)) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*\.json$/.test(name)) continue;
  const match = resolvePruneMatch(name.slice(0, -5), pruneContext);
  if ((match?.webId ?? match?.id) === protectedId || !pruneDue(match, pruneContext.seen, now)) continue;
  await rm(`${dir}/${name}`);
  console.log(`${category}: poda ${name}`);
}
let topFile = null;
try { topFile = JSON.parse(await readFile(`public/data/${TOP_FILENAME}`, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') topFile = {}; }
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
  matches = selectMatches(fixtures.matches, { onlyMatch });
  // --match manual: también vale para un partido ya jugado (FT) que haga falta rehacer.
  if (!matches.length) matches = (fixtures.matches ?? []).filter(m => m.id === onlyMatch || m.webId === onlyMatch);
  if (!matches.length) {
    try {
      const s = JSON.parse(await readFile(`public/data/youtube-scripts/${onlyMatch}.json`, 'utf8'));
      matches = [{ id: onlyMatch, webId: onlyMatch, home: s.home, away: s.away, competition: s.competition ?? null, kickoff: s.kickoff ?? null }];
      console.log(`${category}: ${onlyMatch} fuera de fixtures; identidad del guión`);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  const registered = registerExtra(topFile ?? { ranking: [], extra: [] }, [protectedId]);
  if (registered.added.length) {
    topFile = registered.top;
    await saveTopFile();
    console.log(`${category}: extra manual ${registered.added.join(', ')}`);
  }
} else {
  if (manualTop) {
    const registered = registerExtra(topFile ?? { ranking: [], extra: [] }, liveRanked.slice(topDefault, top));
    if (registered.added.length) {
      topFile = registered.top;
      await saveTopFile();
      console.log(`${category}: extras manuales ${registered.added.join(', ')}`);
    }
  }
  const wanted = new Set(effectiveIds(topFile, top));
  matches = futureNs.filter(m => wanted.has(m.webId ?? m.id)).sort((a, b) => (a.kickoff < b.kickoff ? -1 : 1));
  if (limitRaw != null) matches = matches.slice(0, Math.max(1, Number(limitRaw)));
}
if (!onlyMatch) matches = matches.filter(match => !pruneDue(match, pruneContext.seen, now));
if (!matches.length) {
  console.log(`${category}: sin partidos para generar`);
  process.exit(0);
}
const published = JSON.parse(await readFile('public/data/evaluation-report.json', 'utf8')).published === true;
let scorers; try { scorers = JSON.parse(await readFile('public/data/scorers.json', 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const guide = await readFile(`scripts/prompts/${category}.md`, 'utf8');
const instructionVersion = createHash('sha256').update(guide).digest('hex');
let failed = 0;
const breaker = createProviderBreaker();
for (const match of matches) {
  const matchId = match.webId ?? match.id, file = `${dir}/${matchId}.json`;
  try {
    const old = JSON.parse(await readFile(file, 'utf8'));
    if (!args['--force'] && validateContent(old, category, matchId) && !contentIdentityErrors(old, match).length) { console.log(`${category}: ${matchId} ya existe`); continue; }
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
  breaker.reset();
  try {
    if (category === 'motion-prompts') {
      // v4: banco hasta 30 paginado en 3 lotes de 10 para no truncar el techo.
      const batches = [1, 4, 7, 10, 13];
      const collected = [];
      let provider = null, model = null;
      for (const offset of batches) {
        const batchInstruction = `BATCH ${offset}-${offset + 2} of 15: return EXACTLY 3 entries (global n=${offset}..${offset + 2} assigned later, use n=1..3 locally). Vary kinds and editorial variants from other batches so the 30 do not repeat. Include all executable contract fields (motionSystem carbon-v1, beats, easing, background, motion, camera, transition, emphasis_words, signature_move 1 per entry max 4 distinct per batch set, revealMode sequential|spotlight for statistical, design_rationale {beat,tecnica,porque}). Keep each prompt prose 250-330 words. Camera tilt 0-2deg max. Every prompt text must contain the words Spanish, transition, source or sample, editorial and statistical, plus 9:16. Never write % or the word percent. Use only {{fact.id}} markers listed in factIds.`;
        let batchResult = null; let correction = '';
        for (let attempt = 0; attempt < 3 && !batchResult; attempt++) {
          try {
            batchResult = await withFailover([{ role: 'system', content: guide }, { role: 'user', content: `${batchInstruction}${correction}\n` + JSON.stringify({ ...identity, validationHints, batch: { offset, count: 3 } }) }], {
              orderVar: 'MOTION_PROVIDER_ORDER', maxTokens: Number(process.env.MOTION_MAX_TOKENS) || 12000, timeoutMs: 240000, breaker,
              // Ganador matriz Fase 2: deepseek + effort low (4:33, 0 reintentos, misma calidad).
              // MOTION_REASONING_EFFORT=none vuelve al esfuerzo por defecto del proveedor.
              reasoningEffort: (() => { const v = (process.env.MOTION_REASONING_EFFORT ?? '').trim().toLowerCase(); return (v === 'none' || v === 'default') ? null : (v || 'low'); })(),
              validate: text => {
                const draft = extractJson(text);
                if (Array.isArray(draft.prompts)) draft.prompts.forEach((row, i) => { row.n = i + 1; });
                const errors = promptErrors({ prompts: draft.prompts }, { category, home, away, facts, published });
                if (!draft.prompts?.every(p => Array.isArray(p.presentations) && p.presentations.join(',') === 'editorial,statistical')) errors.push('Cada Motion Prompt requiere las dos presentaciones');
                if (errors.length) throw new Error(errors.slice(0, 8).join('; '));
                return draft;
              },
            });
          } catch (e) { correction = `\nCORRECTIONS from previous attempt (fix ALL, resend full 3-entry JSON): ${String(e.message).slice(0, 600)}`; if (attempt === 2) throw e; }
        }
        provider = batchResult.provider; model = batchResult.model;
        const renumbered = batchResult.value.prompts.map((row, i) => ({ ...row, n: collected.length + i + 1 }));
        collected.push(...renumbered);
        for (const part of [`${file}.part-1.json`, `${file}.part-2.json`, `${file}.part-3.json`]) await rm(part, { force: true });
      }
      const merged = { prompts: collected };
      const errors = promptErrors(merged, { category, home, away, facts, published });
      if (errors.length) throw new Error(errors.slice(0, 8).join('; '));
      result = { provider, model, value: merged, failures: [] };
    } else {
      result = await withFailover([{ role: 'system', content: guide }, { role: 'user', content: JSON.stringify({ ...identity, validationHints }) }], {
        orderVar: 'SCRIPT_PROVIDER_ORDER', maxTokens: 12000, timeoutMs: 180000, breaker,
        validate: text => {
          const draft = extractJson(text);
          const errors = promptErrors(draft, { category, home, away, facts, published });
          if (errors.length) throw new Error(errors.slice(0, 8).join('; '));
          return draft;
        },
      });
    }
    const payload = { version: 2, category, ...identity, instructionVersion, author: { provider: result.provider, model: result.model }, generatedAt: new Date().toISOString(), prompts: result.value.prompts };
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
