import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { persistFinished, persistPrunedAnalyses, updateMatchProbabilities, ensureAnalyses, catchUpAnalyses } from '../scripts/update-data.mjs';
import { observeFinishedMatches, buildPruneContext, PRUNE_GRACE_MS } from '../src/lib/pruning.js';

const now = Date.parse('2026-10-08T22:00:00Z');
const match = { id: 'af-1', webId: 'home-vs-away-date', home: 'Home', away: 'Away', competition: 'laliga', kickoff: '2026-10-08T18:00:00Z', status: 'FT', homeScore: 2, awayScore: 1 };
async function directory(t) {
  const dir = await mkdtemp(join(tmpdir(), 'goatlab-retention-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('terminal probability stays byte-identical through grace, then disappears without regeneration', async t => {
  const dir = await directory(t);
  const file = join(dir, 'af-1.json');
  const bytes = '{"sentinel":"original forecast"}\n';
  await writeFile(file, bytes);
  const ledger = observeFinishedMatches(null, [match], now - PRUNE_GRACE_MS);
  const pruneContext = buildPruneContext([match], ledger);
  await updateMatchProbabilities([match], { dir, pruneContext, now });
  assert.equal(await readFile(file, 'utf8'), bytes);
  await updateMatchProbabilities([match], { dir, pruneContext, now: now + 1 });
  assert.deepEqual(await readdir(dir), []);
});

test('probability maintenance works without generation targets and preserves unrelated unknowns', async t => {
  const dir = await directory(t);
  const ledger = observeFinishedMatches(null, [match], now - PRUNE_GRACE_MS - 1, { previousMatches: [{ ...match, id: 'fd-2' }] });
  for (const id of ['af-1', 'fd-2', 'unknown']) await writeFile(join(dir, `${id}.json`), '{}');
  await updateMatchProbabilities([], { dir, pruneContext: buildPruneContext([], ledger), now });
  assert.deepEqual(await readdir(dir), ['unknown.json']);
});

test('analysis persistence uses its in-memory map instead of reintroducing retired disk rows', async t => {
  const dir = await directory(t), path = join(dir, 'analysis.json');
  await writeFile(path, JSON.stringify({ 'af-1': { old: true } }));
  const context = buildPruneContext([], observeFinishedMatches(null, [match], now - PRUNE_GRACE_MS - 1));
  await persistPrunedAnalyses({ 'af-1': { retired: true }, 'af-new': { newlyGenerated: true } }, context, { path, now });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { 'af-new': { newlyGenerated: true } });
});

test('terminal analysis never prepares or requests a model in either generation path', async () => {
  await ensureAnalyses([match], {}, () => { throw new Error('terminal must not prepare'); });
  assert.equal(await catchUpAnalyses([match], {}, { budget: 3 }), 0);
});

test('ledger persistence is atomic, keeps its first observation and restarts after corruption', async t => {
  const dir = await directory(t), path = join(dir, 'finished-at.json');
  const first = now - PRUNE_GRACE_MS - 1;
  await persistFinished([match], { path, now: first });
  await persistFinished([{ ...match, homeScore: 3 }], { path, now });
  let ledger = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(ledger.seen[match.webId], new Date(first).toISOString());
  assert.deepEqual(await readdir(dir), ['finished-at.json']);
  await writeFile(path, '{broken');
  await persistFinished([match], { path, now });
  ledger = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(ledger.seen[match.webId], new Date(now).toISOString());
});
