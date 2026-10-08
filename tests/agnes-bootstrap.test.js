import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { collectLegacy, legacyMatchIds, legacySlots, preparationSummary, readLegacySqlite, writePrivateSeed } from '../scripts/bootstrap-agnes-state.mjs';
import { createAgnesState, reduceAgnesState } from '../src/lib/agnes-state.js';

const run = promisify(execFile);
const nowMs = Date.parse('2026-10-08T06:00:00Z');
const hash = value => createHash('sha256').update(value).digest('hex');
async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), 'agnes-bootstrap-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test('cutover collects canonical IDs, provider aliases and retained snapshots', () => {
  assert.deepEqual(legacyMatchIds([
    { matches: [{ id: 'af-1', webId: 'a-b' }] },
    { matchId: 'a-b', providerId: 'fd-1' },
    { seen: { 'old-final': '2026-10-01' }, snapshots: { 'old-final': { ids: ['af-old', 'fd-old'] } } },
    { matchId: '../escape' },
  ], { images: [{ match_id: 'sqlite-only' }] }), ['a-b', 'af-1', 'af-old', 'fd-1', 'fd-old', 'old-final', 'sqlite-only']);
  assert.throws(() => legacyMatchIds([{ matches: 'not-an-array' }]), /inválido/);
  assert.throws(() => legacyMatchIds([{ snapshots: [] }]), /inválido/);
  assert.throws(() => legacyMatchIds([{ matchId: 'a-b', ids: 'not-an-array' }]), /inválidos/);
});

test('SQLite import preserves recovery IDs and hashes, omitting private raw payloads', () => {
  const reference = 'https://provider.test/image?token=private';
  const slots = legacySlots({
    matches: [{ match_id: 'a-b', expires: (nowMs + 86400_000) / 1000 }],
    images: [{ match_id: 'a-b', slot: 0, status: 'done', result: JSON.stringify({ model: 'image-model', prompt: 'raw image prompt', path: '/private/output.jpg', url: reference }) }],
    video_tasks: [{ match_id: 'a-b', ordinal: 1, status: 'pending', video_id: 'video-123', prompt: 'raw video prompt', reference, expires: (nowMs + 86400_000) / 1000, result: 'private diagnostics' }],
    video_models: [{ match_id: 'a-b', ordinal: 1, model: 'video-model' }],
  }, { nowMs });
  assert.equal(slots[0].state, 'completed');
  assert.equal(slots[0].promptHash, hash('raw image prompt'));
  assert.equal(slots[1].state, 'pending');
  assert.equal(slots[1].videoId, 'video-123');
  assert.equal(slots[1].referenceHash, hash(reference));
  const serialized = JSON.stringify(slots);
  for (const privateValue of ['raw image prompt', 'raw video prompt', '/private/output.jpg', reference, 'private diagnostics']) assert.ok(!serialized.includes(privateValue));
});

test('unknown or uncertain image evidence stays blocked and contradictory tasks abort', () => {
  const [image] = legacySlots({ images: [{ match_id: 'a-b', slot: 0, status: 'pending', result: null }] }, { nowMs });
  assert.equal(image.state, 'uncertain');
  assert.match(image.promptHash, /^[a-f0-9]{64}$/);
  assert.equal(image.expiresAtMs, nowMs + 86400_000);
  const row = { match_id: 'a-b', ordinal: 0, status: 'pending', prompt: 'prompt', reference: 'reference', expires: nowMs / 1000 + 1000 };
  assert.throws(() => legacySlots({ video_tasks: [{ ...row, video_id: 'first' }, { ...row, video_id: 'second' }] }, { nowMs }), /contradictoria/);
});

test('preparation reads identities from file names and refuses malformed present JSON', async t => {
  const repo = await directory(t), data = join(repo, 'public/data');
  await mkdir(join(data, 'image-prompts'), { recursive: true });
  await mkdir(join(data, 'media-pack'), { recursive: true });
  await writeFile(join(data, 'fixtures.json'), JSON.stringify({ matches: [{ id: 'af-1', webId: 'a-b' }] }));
  await writeFile(join(data, 'image-prompts', 'old-prompt.json'), '{}');
  await writeFile(join(data, 'media-pack', 'old-bank.progress.json'), '{}');
  await writeFile(join(data, 'media-pack', '_agnes-hourly.json'), '{}');
  await writeFile(join(data, 'media-pack', 'snapshot-only.content.json'), JSON.stringify({ 'image-prompts': { matchId: 'nested-snapshot' } }));
  await writeFile(join(data, 'media-pack', 'ready-only.ready'), '{}');
  await mkdir(join(data, 'media-pack', 'gen', 'generated-only'), { recursive: true });
  const collected = await collectLegacy({ repo, nowMs });
  assert.deepEqual(collected.legacyMatchIds, ['a-b', 'af-1', 'generated-only', 'nested-snapshot', 'old-bank', 'old-prompt', 'ready-only', 'snapshot-only']);
  const summary = preparationSummary(collected, { nowMs });
  assert.equal(summary.mode, 'prepare-only');
  assert.equal(summary.conservativeQuota, true);
  assert.ok(!JSON.stringify(summary).includes('old-bank'));
  await writeFile(join(data, 'image-prompts', 'old-prompt.json'), '{');
  await assert.rejects(collectLegacy({ repo, nowMs }), /JSON legado ilegible/);
});

test('legacy SQLite is opened read-only, absent databases are never created', async t => {
  const root = await directory(t), path = join(root, 'legacy.sqlite');
  await run('python3', ['-c', "import sqlite3,sys; db=sqlite3.connect(sys.argv[1]); db.execute('CREATE TABLE video_tasks(match_id TEXT, ordinal INTEGER, status TEXT, video_id TEXT, prompt TEXT, reference TEXT, expires REAL, result TEXT)'); db.execute('INSERT INTO video_tasks VALUES(?,?,?,?,?,?,?,?)', ('a-b',0,'pending','task-id','prompt','reference',2000000000,None)); db.commit(); db.close()", path]);
  const before = await readFile(path);
  const imported = await readLegacySqlite(path);
  assert.equal(imported.video_tasks[0].video_id, 'task-id');
  assert.deepEqual(await readFile(path), before);
  const absent = join(root, 'absent.sqlite');
  await assert.rejects(readLegacySqlite(absent), /solo lectura/);
  await assert.rejects(stat(absent), { code: 'ENOENT' });
});

test('seed export is private and cannot target tracked/public repository paths', async t => {
  const repo = await directory(t), path = join(repo, '.cache', 'state-seed.json');
  const seed = { schemaVersion: 1, privateTask: 'video-123' };
  await writePrivateSeed(path, seed, { repo });
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(path)), { seed });
  await assert.rejects(writePrivateSeed(join(repo, 'public/data/state.json'), seed, { repo }), /seed privado/);
  await mkdir(join(repo, 'public'), { recursive: true });
  await symlink(join(repo, 'public'), join(repo, '.cache', 'public-link'));
  await assert.rejects(writePrivateSeed(join(repo, '.cache', 'public-link', 'state.json'), seed, { repo }), /seed privado/);
});

test('default CLI has no cloud side effects and logs only an aggregate summary', async t => {
  const repo = await directory(t);
  const script = resolve('scripts/bootstrap-agnes-state.mjs');
  const { stdout, stderr } = await run(process.execPath, [script, `--repo=${repo}`], { env: { PATH: process.env.PATH } });
  assert.equal(stderr, '');
  assert.equal(JSON.parse(stdout).seedWritten, false);
  assert.equal(JSON.parse(stdout).legacyMatches, 0);
});

test('exported migration seed closes current quota and preserves uncertain legacy slots', async t => {
  const repo = await directory(t), path = join(repo, '.cache', 'seed.json');
  const slots = legacySlots({ images: [{ match_id: 'a-b', slot: 0, status: 'uncertain', result: null }] }, { nowMs });
  const seed = createAgnesState({ nowMs, legacyMatchIds: ['a-b'], legacySlots: slots });
  await writePrivateSeed(path, seed, { repo });
  const loaded = JSON.parse(await readFile(path)).seed;
  assert.equal(loaded.slots['a-b:image:0'].state, 'uncertain');
  assert.equal(loaded.quota['2026-10-08'].images, 4000);
  assert.equal(loaded.quota['2026-10-08'].video_seconds, 360);
  const result = reduceAgnesState(loaded, 'reserve', {
    matchId: 'a-b', kind: 'image', ordinal: 0, model: 'agnes-image-2.5-flash', promptHash: hash('new prompt'), attemptId: 'new-attempt',
    expiresAtMs: nowMs + 86400_000, guard: { manual: true, kickoffMs: nowMs },
  }, { nowMs });
  assert.equal(result.result.canPost, false);
});
