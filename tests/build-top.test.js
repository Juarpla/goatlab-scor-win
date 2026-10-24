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
  assert.deepEqual(top.ranking.map(r => r.id), ['x-x']);
  assert.deepEqual(top.extra, ['y-y', 'gone']);
  assert.ok(top.ranking.every(r => r.id && r.kickoff));
});
test('build-top reserves the next Barcelona and Madrid fixtures even beyond tomorrow', async t => {
  const root = await mkdtemp(join(tmpdir(), 'goatlab-top-window-')); t.after(() => rm(root, { recursive: true, force: true }));
  const now = Date.parse('2026-10-22T15:00:00Z');
  const soon = index => `2026-10-22T${16 + index}:45:00Z`;
  const matches = [
    { id: 'early-1', home: 'Sturm', away: 'Marseille', status: 'NS', kickoff: soon(0) },
    { id: 'early-2', home: 'Union', away: 'Hapoel', status: 'NS', kickoff: soon(1) },
    { id: 'early-3', home: 'OFI', away: 'Leverkusen', status: 'NS', kickoff: soon(2) },
    { id: 'early-4', home: 'Lech', away: 'Sunderland', status: 'NS', kickoff: soon(3) },
    { id: 'early-5', home: 'Juventus', away: 'Rennes', status: 'NS', kickoff: soon(4) },
    { id: 'barca', home: 'FC Barcelona', away: 'Getafe CF', status: 'NS', kickoff: '2026-10-23T20:00:00Z' },
    { id: 'classic', home: 'FC Barcelona', away: 'Real Madrid CF', status: 'NS', kickoff: '2026-10-25T20:00:00Z' },
  ];
  await mkdir(join(root, 'public/data'), { recursive: true });
  await writeFile(join(root, 'public/data/fixtures.json'), JSON.stringify({ matches }));
  const top = await buildTop({ repo: root, now });
  assert.equal(top.priority, 2);
  assert.equal(top.n, 5);
  assert.equal(top.ranking[0].id, 'barca');
  assert.equal(top.ranking[1].id, 'classic');
});
test('build-top omits a provider-only id that still lacks a descriptive code', async t => {
  const root = await mkdtemp(join(tmpdir(), 'goatlab-top-unnamed-')); t.after(() => rm(root, { recursive: true, force: true }));
  const kickoff = new Date(Date.now() + 3600_000).toISOString();
  const matches = [
    { id: 'fd-9', webId: null, home: 'PAE AEK', away: 'Shakhtar', status: 'NS', kickoff },
    { id: 'af-2', webId: 'alpha-vs-beta-2026-10-14', home: 'Alpha', away: 'Beta', status: 'NS', kickoff },
  ];
  await mkdir(join(root, 'public/data'), { recursive: true });
  await writeFile(join(root, 'public/data/fixtures.json'), JSON.stringify({ matches }));
  const top = await buildTop({ repo: root });
  assert.deepEqual(top.ranking.map(row => row.id), ['alpha-vs-beta-2026-10-14']);
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
