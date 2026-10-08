import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { maintainMedia, mediaArtifactId } from '../fly/gateway/workspace/skills/goatlab/scripts/maintain-media.mjs';
import { createAgnesState, reduceAgnesState } from '../src/lib/agnes-state.js';

const now = Date.parse('2026-10-08T20:00:00Z');
const final = { id: 'af-1', webId: 'a-b', home: 'Alpha', away: 'Beta', competition: 'League', kickoff: '2026-10-08T15:00:00Z', status: 'FT', homeScore: 1, awayScore: 0 };
const ledger = { version: 1, updatedAt: new Date(now).toISOString(), seen: { 'a-b': '2026-10-08T18:59:59Z' }, snapshots: { 'a-b': { ...final, ids: ['af-1', 'a-b'] } } };
async function fixture(t, matches = []) {
  const repo = await mkdtemp(join(tmpdir(), 'goatlab-maintenance-')); t.after(() => rm(repo, { recursive: true, force: true }));
  const dir = join(repo, 'public/data/media-pack'); await mkdir(join(dir, 'gen/a-b'), { recursive: true });
  await writeFile(join(repo, 'public/data/fixtures.json'), JSON.stringify({ matches }));
  await writeFile(join(repo, 'public/data/finished-at.json'), JSON.stringify(ledger));
  for (const name of ['a-b.json', 'a-b.progress.json', 'a-b.ready', '_agnes-hourly.json', 'unknown.json', 'a-b-neighbor.json']) await writeFile(join(dir, name), '{}');
  await writeFile(join(dir, 'gen/a-b/0.jpg'), 'binary');
  return { repo, dir };
}
const claim = async (op, input) => op === 'cleanupclaim' ? { canDelete: true, claimId: input.claimId } : { saved: true };

test('maintenance runs with empty fixtures using terminal evidence and removes local files only after remote proof', async t => {
  const options = await fixture(t); const events = [];
  const result = await maintainMedia({ ...options, now, transactImpl: async (op, value) => { events.push(op); return claim(op, value); }, r2Impl: async prefix => {
    events.push(prefix); assert.equal(await readFile(join(options.dir, 'gen/a-b/0.jpg'), 'utf8'), 'binary'); return { ok: true };
  } });
  assert.deepEqual(result.deletedIds, ['a-b']);
  assert.deepEqual(events, ['cleanupclaim', 'partidos/a-b/', 'cleanupconfirm']);
  await assert.rejects(access(join(options.dir, 'a-b.json'))); await assert.rejects(access(join(options.dir, 'gen/a-b')));
  for (const name of ['unknown.json', 'a-b-neighbor.json', '_agnes-hourly.json']) await access(join(options.dir, name));
});
test('unconfirmed remote deletion or private acknowledgement preserves all local candidates for retry', async t => {
  for (const failure of ['claim', 'delete', 'confirm']) {
    const options = await fixture(t);
    const result = await maintainMedia({ ...options, now, transactImpl: async (op, value) => {
      if (op === `cleanup${failure}`) throw new Error('lost ACK'); return claim(op, value);
    }, r2Impl: async () => failure === 'delete' ? null : { ok: true } });
    assert.deepEqual(result.deletedIds, []); assert.deepEqual(result.preservedIds, ['a-b']);
    await access(join(options.dir, 'a-b.json')); await access(join(options.dir, 'gen/a-b/0.jpg'));
  }
});
test('current LIVE correction and manual provider alias both protect a saved terminal bank', async t => {
  for (const mode of ['regression', 'manual', 'active']) {
    const options = await fixture(t, mode === 'regression' ? [{ ...final, status: 'LIVE' }] : []);
    let deletes = 0;
    await maintainMedia({ ...options, now, protectedMatches: mode === 'manual' ? ['af-1'] : [], transactImpl: async () => ({ canDelete: false }), r2Impl: async () => { deletes++; return { ok: true }; } });
    assert.equal(deletes, 0); await access(join(options.dir, 'a-b.json'));
  }
});
test('a producer using a demonstrated provider alias prevents canonical cleanup atomically', () => {
  let state = createAgnesState({ nowMs: now - 86_400_000 });
  state = reduceAgnesState(state, 'heartbeat', { runId: 'producer', matchId: 'af-1' }, { nowMs: now }).state;
  const input = { matchId: 'a-b', relatedMatchIds: ['a-b', 'af-1'], claimId: 'cleanup', pruneDue: true };
  const blocked = reduceAgnesState(state, 'cleanupclaim', input, { nowMs: now });
  assert.equal(blocked.result.canDelete, false); assert.equal(blocked.changed, false);
  const closed = reduceAgnesState(state, 'cleanupclaim', input, { nowMs: now + 120_001 });
  assert.equal(closed.result.canDelete, true); assert.equal(closed.state.matches['af-1'].closed, true); assert.equal(closed.state.matches['a-b'].closed, true);
});
test('reserved reports and path traversal are never artifact identities', () => {
  assert.equal(mediaArtifactId('_agnes-hourly.json'), null); assert.equal(mediaArtifactId('../a-b.json'), null);
  assert.equal(mediaArtifactId('a-b.progress.json'), 'a-b'); assert.equal(mediaArtifactId('a-b.content.json'), 'a-b');
});
