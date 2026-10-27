import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readMediaBank } from '../src/lib/media-reader.js';
import { generateMediaBanks } from '../fly/gateway/workspace/skills/goatlab/scripts/generate-media-pack.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'goatlab-reader-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const now = Date.parse('2026-10-10T17:00:00Z');
  const match = { webId: 'a-b', home: 'Alpha', away: 'Beta', competition: 'league', kickoff: '2026-10-11T18:00:00Z' };
  const pack = { version: 1, matchId: 'a-b', ...match };
  const images = { ...pack, category: 'image-prompts', prompts: ['ball-duel', 'goal-action', 'supporters', 'stadium'].map((kind, i) => ({ n: i+1, kind, title: kind,
    prompt: `Referential photorealistic illustration of Alpha and Beta football teams, stadium flags, team crests, supporters fans crowd, vertical 9:16. ${'Realistic uniforms, natural lighting, stable anatomy and coherent sports movement. '.repeat(4)}` + kind })) };
  const videos = { ...pack, category: 'video-prompts', prompts: ['push-in', 'tracking'].map((kind, i) => ({ n: i+1, kind, title: kind,
    prompt: `Animate the input image, 6 seconds, vertical 9:16, smooth ${kind} camera. ${'Stable anatomy and coherent sports movement, preserve both teams. '.repeat(5)}` })) };
  const content = { 'image-prompts': images, 'video-prompts': videos };
  const env = { MEDIA_ROLE: 'consumer', R2_PUBLIC_BASE: 'https://media.test', R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'access', R2_SECRET_ACCESS_KEY: 'secret' };
  const objects = new Map(), calls = [];
  const photo = ordinal => objects.set(`${ordinal}.png`, { bytes: Buffer.from(`photo ${ordinal}`), type: 'image/png', meta: { prompthash: hash(images.prompts[ordinal].prompt), model: 'agnes-image-2.5-flash', width: '1472', height: '2624' } });
  const clip = ordinal => objects.set(`clip-${ordinal}.mp4`, { bytes: Buffer.from(`clip ${ordinal}`), type: 'video/mp4', meta: { prompthash: hash(videos.prompts[ordinal%2].prompt), model: 'agnes-video-2.5-flash', width: '720', height: '1280', duration: '6', referencehash: hash(`https://media.test/partidos/a-b/${ordinal%4}.png`) } });
  let failure = null, corrupt = false;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    assert.ok(['HEAD', 'GET'].includes(options.method || 'GET'));
    assert.ok(['account.r2.cloudflarestorage.com', 'media.test'].includes(new URL(url).hostname));
    if (failure instanceof Error) throw failure;
    if (failure) return new Response(null, { status: failure });
    const obj = objects.get(new URL(url).pathname.split('/').at(-1));
    if (!obj) return new Response(null, { status: 404 });
    const headers = { 'content-type': obj.type, 'content-length': String(obj.bytes.length), ...Object.fromEntries(Object.entries({ ...obj.meta, sha256: hash(obj.bytes) }).map(([k, v]) => ['x-amz-meta-'+k, v])) };
    return new Response(options.method === 'HEAD' ? null : corrupt ? Buffer.from('corrupt') : obj.bytes, { headers });
  };
  const run = () => readMediaBank({ match, content, dir, env, fetchImpl, clock: () => now });
  return { dir, match, content, env, calls, objects, photo, clip, run, fail: value => { failure = value; }, corrupt: () => { corrupt = true; } };
}
test('reader verifies a complete 4+2 bank using only R2 reads without producer credentials', async t => {
  const f = await fixture(t);
  for (let i=0; i<4; i++) f.photo(i);
  f.clip(0); f.clip(1);
  const result = await f.run();
  assert.equal(result.count, 4); assert.equal(result.clips, 2); assert.equal(result.complete, true);
  assert.equal(result.phase, 'finished');
  const bank = JSON.parse(await readFile(join(f.dir, 'a-b.json')));
  assert.equal(bank.bankStatus, 'complete'); assert.equal(bank.assets.length, 4);
  assert.equal(JSON.parse(await readFile(join(f.dir, 'a-b.ready'))).readerVersion, 1);
  assert.ok(f.calls.every(call => call.method === 'HEAD' || call.method === 'GET'));
});
test('404 clips produce a successful playable partial, and no objects produces graphics readiness', async t => {
  const f = await fixture(t);
  for (let i=0; i<4; i++) f.photo(i);
  const partial = await f.run();
  assert.equal(partial.count, 4); assert.equal(partial.clips, 0); assert.equal(partial.ready, true);
  assert.equal(partial.phase, 'finished'); assert.deepEqual(partial.failures, []);
  f.objects.clear();
  const empty = await f.run();
  assert.equal(empty.count, 0); assert.equal(empty.clips, 0); assert.equal(empty.ready, true);
  assert.equal(JSON.parse(await readFile(join(f.dir, 'a-b.json'))).assets.length, 0);
});
test('access and connection failures retain compatible checked local bytes', async t => {
  const f = await fixture(t); f.photo(0);
  await f.run();
  for (const failure of [403, new TypeError('network unavailable')]) {
    f.fail(failure);
    const partial = await f.run();
    assert.equal(partial.count, 1); assert.equal(partial.phase, 'unavailable'); assert.equal(partial.ready, true);
    assert.ok(partial.diagnostics.some(row => row.code === (failure === 403 ? 'access' : 'connection')));
  }
  await writeFile(join(f.dir, 'gen/a-b/0.png'), 'damaged cache');
  assert.equal((await f.run()).count, 0);
});
test('mismatched prompts, corrupt bytes and duplicate clips never inflate availability', async t => {
  const f = await fixture(t); f.photo(0); f.photo(1); f.clip(0); f.clip(1);
  f.objects.get('0.png').meta.prompthash = hash('wrong match prompt');
  let result = await f.run();
  assert.equal(result.count, 1); assert.equal(result.clips, 1); assert.equal(result.phase, 'unavailable');
  f.objects.get('0.png').meta.prompthash = hash(f.content['image-prompts'].prompts[0].prompt);
  f.objects.get('clip-1.mp4').bytes = f.objects.get('clip-0.mp4').bytes;
  result = await f.run(); assert.equal(result.clips, 1);
  f.corrupt();
  result = await f.run();
  assert.equal(result.phase, 'unavailable');
  // A failed download can retain the previously verified local snapshot.
  assert.equal(result.count, 2);
});
test('a changed match snapshot never reuses a previous bank during an outage', async t => {
  const f = await fixture(t); f.photo(0); await f.run();
  f.content['image-prompts'].prompts[0].prompt += 'Changed direction.';
  f.fail(503);
  assert.equal((await f.run()).count, 0);
});
test('Gateway and local generator calls fail before any remote operation', async () => {
  for (const env of [{}, { MEDIA_ROLE: 'consumer', GITHUB_ACTIONS: 'true' }, { MEDIA_ROLE: 'producer' }]) {
    const forbidden = () => { throw new Error('remote operation called'); };
    await assert.rejects(generateMediaBanks({ env, execImpl: forbidden, fetchImpl: forbidden, transactImpl: forbidden, maintainImpl: forbidden }), /exclusivamente a GitHub Actions/);
  }
});
test('consumer CLI entrypoints reject production before reading inputs or credentials', () => {
  for (const script of ['scripts/generate-match-content.mjs', 'scripts/generate-youtube-scripts.mjs', 'scripts/generate-match-prompts.mjs', 'scripts/maintain-media.mjs']) {
    const result = spawnSync(process.execPath, [resolve(script)], { cwd: tmpdir(), env: { ...process.env, MEDIA_ROLE: 'consumer' }, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /pertenece (?:exclusivamente )?a GitHub Actions/);
    assert.equal(result.stdout, '');
  }
});

test('graphics retain verified facts from photo/video packs without motion content', async t => {
  const f = await fixture(t);
  const fact = { id: 'home.gf', label: 'Alpha · goles', value: 7, unit: 'goles', source: 'fixtures:a-b', sampleSize: 5 };
  f.content['image-prompts'].facts = [fact];
  await f.run();
  let bank = JSON.parse(await readFile(join(f.dir, 'a-b.json')));
  assert.deepEqual(bank.facts, [fact]);
  assert.equal(bank.motionPrompts, undefined);
  // Retired video documents cannot supply facts when the image identity is invalid.
  f.content['image-prompts'].home = 'Wrong team';
  f.content['video-prompts'].facts = [{ ...fact, value: 3 }];
  await f.run();
  bank = JSON.parse(await readFile(join(f.dir, 'a-b.json')));
  assert.deepEqual(bank.facts, []);
});

test('R2 media consumption does not require video prompt content', async t => {
  const f = await fixture(t);
  delete f.content['video-prompts'];
  for (let ordinal=0;ordinal<4;ordinal++) f.photo(ordinal);
  f.clip(0); f.clip(1);
  assert.equal((await f.run()).complete, true);
});
