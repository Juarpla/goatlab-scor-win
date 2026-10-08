import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rankMatches } from '../src/lib/teams.js';
import { observeFinishedMatches, PRUNE_GRACE_MS } from '../src/lib/pruning.js';
import { buildTop } from '../scripts/build-top.mjs';
const run = promisify(execFile);

test('build-top writes relevance ranking while conserving extras without terminal evidence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'goatlab-top-')); t.after(() => rm(root, { recursive: true, force: true }));
  const kickoff = new Date(Date.now() + 3600_000).toISOString();
  const matches = [
    { id: 'x-x', home: 'X', away: 'Y', status: 'NS', kickoff },
    { id: 'y-y', home: 'Y', away: 'Z', status: 'NS', kickoff },
    { id: 'z-z', home: 'Z', away: 'W', status: 'FT', kickoff },
  ];
  await mkdir(join(root, 'public/data'), { recursive: true });
  await writeFile(join(root, 'public/data/fixtures.json'), JSON.stringify({ matches }));
  await writeFile(join(root, 'public/data/top.json'), JSON.stringify({ version: 1, ranking: [], extra: ['y-y', 'gone'] }));
  await run(process.execPath, ['scripts/build-top.mjs'], { env: { ...process.env, GOATLAB_REPO: root } });
  const top = JSON.parse(await readFile(join(root, 'public/data/top.json'), 'utf8'));
  assert.equal(top.version, 1); assert.equal(top.n, 5);
  assert.deepEqual(top.ranking.map(r => r.id), rankMatches(matches.filter(m => m.status === 'NS')).map(m => m.id));
  assert.deepEqual(top.extra, ['y-y', 'gone']);
  assert.ok(top.ranking.every(r => r.id && r.kickoff));
});
test('build-top retires a confirmed snapshot extra only beyond its grace', async t => {
  const root = await mkdtemp(join(tmpdir(), 'goatlab-top-grace-')); t.after(() => rm(root, { recursive: true, force: true }));
  const now = Date.parse('2026-10-08T22:00:00Z');
  const match = { id: 'af-1', webId: 'done', home: 'Home', away: 'Away', competition: 'laliga', status: 'FT', kickoff: '2026-10-08T18:00:00Z', homeScore: 0, awayScore: 0 };
  await mkdir(join(root, 'public/data'), { recursive: true });
  await writeFile(join(root, 'public/data/fixtures.json'), JSON.stringify({ matches: [] }));
  await writeFile(join(root, 'public/data/top.json'), JSON.stringify({ version: 1, ranking: [], extra: ['done', 'unknown'] }));
  await writeFile(join(root, 'public/data/finished-at.json'), JSON.stringify(observeFinishedMatches(null, [match], now - PRUNE_GRACE_MS)));
  assert.deepEqual((await buildTop({ repo: root, now })).extra, ['done', 'unknown']);
  assert.deepEqual((await buildTop({ repo: root, now: now + 1 })).extra, ['unknown']);
  await writeFile(join(root, 'public/data/finished-at.json'), '{broken');
  assert.deepEqual((await buildTop({ repo: root, now: now + 2 })).extra, ['unknown']);
});
