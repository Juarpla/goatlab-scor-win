import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rankMatches } from '../src/lib/teams.js';
const run = promisify(execFile);

test('build-top writes the full relevance ranking and prunes expired extras', async t => {
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
  assert.deepEqual(top.extra, ['y-y']);
  assert.ok(top.ranking.every(r => r.id && r.kickoff));
});
