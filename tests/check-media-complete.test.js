import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { checkMediaComplete, mediaCheckOutput } from '../scripts/check-media-complete.mjs';
import { CONTENT_CATEGORIES, validateContent } from '../src/lib/match-content.js';
import { contentFingerprint } from '../src/lib/media-contract.js';
import { normalizeAgnesImage } from '../src/lib/agnes.js';

const now = Date.parse('2026-10-08T22:00:00Z');
const stamp = offset => new Date(now + offset).toISOString();
const hash = value => createHash('sha256').update(value).digest('hex');
function match(id = 'alpha-beta', overrides = {}) {
  return { id: `provider-${id}`, webId: id, home: 'Alpha', away: 'Beta', competition: 'nations', kickoff: stamp(3600_000), status: 'NS', ...overrides };
}
function pack(m, category) {
  return { version: 1, category, matchId: m.webId, home: m.home, away: m.away, competition: m.competition, kickoff: m.kickoff,
    prompts: CONTENT_CATEGORIES[category].kinds.map((kind, i) => ({ n: i + 1, kind, title: kind,
      prompt: category === 'image-prompts'
        ? `Referential photorealistic illustration of Alpha and Beta football teams in realistic uniforms, vertical 9:16. ${kind} Stadium, supporters, flags and team crests. ${'Natural lighting and realistic anatomy. '.repeat(5)}`
        : `A 6-second camera movement for the reference image, vertical 9:16. ${kind}. ${'Maintain the original realistic scene and consistent lighting. '.repeat(5)}` })) };
}
function script(m) {
  return { matchId: m.webId, home: m.home, away: m.away, competition: m.competition, kickoff: m.kickoff, description: 'Alpha contra Beta.', scripts: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, title: 'Lectura', hook: 'Alpha y Beta.', narration: 'Alpha y Beta. Consulta goatlab.win.', words: 8 })) };
}
function bank(m, images, videos, imageModel = 'agnes-image-2.5-flash') {
  const assets = images.prompts.map((row, index) => ({ ...normalizeAgnesImage({ matchId: m.webId, index, publicUrl: `https://media.test/${m.webId}/${index}.jpg`, prompt: row.prompt, model: imageModel, at: stamp(0) }), sha256: hash(`image ${index}`), promptHash: hash(row.prompt), model: imageModel }));
  const clips = videos.prompts.map((row, index) => ({ id: `${m.webId}-clip-${index}`, source: 'agnes', url: `https://media.test/${m.webId}/clip-${index}.mp4`, model: 'agnes-video-2.5-flash', width: 720, height: 1280, duration: 6, sha256: hash(`clip ${index}`), promptHash: hash(row.prompt), referenceHash: hash(assets[index].url) }));
  return { matchId: m.webId, bankVersion: 2, bankStatus: 'complete', contentFingerprint: contentFingerprint(m, { ...images, generationModel: imageModel }, { ...videos, generationModel: 'agnes-video-2.5-flash' }), storageVerifiedAt: stamp(0), assets, clips };
}
async function fixture(t, matches = [match()]) {
  const repo = await mkdtemp(join(tmpdir(), 'goatlab-media-check-'));
  t.after(() => rm(repo, { recursive: true, force: true }));
  const data = join(repo, 'public/data');
  const put = async (name, value) => {
    const path = join(data, name);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value));
  };
  await put('fixtures.json', { matches });
  await put('top.json', { version: 1, generatedAt: stamp(0), ranking: matches.map(m => ({ id: m.webId })), extra: [] });
  const complete = async (m = matches[0], imageModel) => {
    const images = pack(m, 'image-prompts'), videos = pack(m, 'video-prompts'), value = bank(m, images, videos, imageModel);
    assert.equal(validateContent(images, 'image-prompts', m.webId), true);
    assert.equal(validateContent(videos, 'video-prompts', m.webId), true);
    await put(`youtube-scripts/${m.webId}.json`, script(m));
    await put(`image-prompts/${m.webId}.json`, images);
    await put(`video-prompts/${m.webId}.json`, videos);
    await put(`media-pack/${m.webId}.json`, value);
    return { images, videos, value };
  };
  const check = (args = {}, env = {}) => checkMediaComplete({ repo, args, env, now });
  return { repo, data, put, complete, check };
}

test('checker accepts proven banks and reports missing inputs as pending without networking', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.check(), { complete: false, reason: 'pending', eligible: 1, pending: 1, top_age_h: 0, top_stale: false, exitCode: 0 });
  await f.complete();
  const result = await f.check();
  assert.equal(result.complete, true);
  assert.equal(result.reason, 'complete');
  assert.equal(result.pending, 0);
});
test('legacy, partial, changed prompts and inconsistent input evidence keep a bank pending', async t => {
  const f = await fixture(t);
  const { value, images } = await f.complete();
  for (const change of [b => delete b.bankVersion, b => { b.bankStatus = 'partial'; }, b => { b.contentFingerprint = hash('old'); }, b => { b.assets[0].promptHash = hash('wrong'); }, b => { b.assets[0].generated.model = 'different'; }, b => { b.clips[0].promptHash = hash('wrong'); }, b => { b.clips[0].referenceHash = hash('absent-photo'); }, b => { b.clips[0].duration = 13; }, b => { b.storageVerifiedAt = stamp(1); }]) {
    const bad = structuredClone(value); change(bad);
    await f.put('media-pack/alpha-beta.json', bad);
    assert.equal((await f.check()).pending, 1);
  }
  await f.put('media-pack/alpha-beta.json', value);
  const changed = structuredClone(images); changed.prompts[0].prompt += ' Revised input.';
  await f.put('image-prompts/alpha-beta.json', changed);
  assert.equal((await f.check()).pending, 1);
});
test('corrupt scripts or prompt identity stay pending even with a matching bank header', async t => {
  const f = await fixture(t);
  const { images } = await f.complete();
  await f.put('youtube-scripts/alpha-beta.json', '{broken');
  assert.equal((await f.check()).pending, 1);
  await f.put('youtube-scripts/alpha-beta.json', script(match()));
  await f.put('image-prompts/alpha-beta.json', { ...images, home: 'Gamma' });
  assert.equal((await f.check()).pending, 1);
});
test('selection requires future NS in top or extras, honors limit and accepts no eligible work', async t => {
  const future = match('first'), second = match('second', { kickoff: stamp(2 * 3600_000) });
  const f = await fixture(t, [future, second, match('past', { kickoff: stamp(-1) }), match('live', { status: '1H' })]);
  await f.complete(future);
  assert.equal((await f.check()).pending, 1);
  assert.equal((await f.check({ '--limit': '1' })).complete, true);
  await f.put('top.json', { version: 1, generatedAt: stamp(0), ranking: [], extra: ['first'] });
  assert.equal((await f.check()).eligible, 1);
  await f.put('top.json', { version: 1, generatedAt: stamp(0), ranking: [], extra: [] });
  const empty = await f.check();
  assert.equal(empty.complete, true);
  assert.equal(empty.reason, 'no-eligible');
  assert.equal(empty.eligible, 0);
});
test('top gating rejects invalid and future input, with manual bypass limited to old age', async t => {
  const f = await fixture(t); await f.complete();
  for (const [top, reason] of [['{broken', 'top-invalid'], [{ version: 9 }, 'top-invalid'], [{ version: 1, generatedAt: stamp(1), ranking: [] }, 'top-future']]) {
    await f.put('top.json', top);
    for (const args of [{}, { '--match': 'provider-alpha-beta' }]) {
      const result = await f.check(args);
      assert.equal(result.exitCode, 2);
      assert.equal(result.reason, reason);
      assert.equal(result.complete, false);
    }
  }
  await f.put('top.json', { version: 1, generatedAt: stamp(-8 * 3600_000), ranking: [{ id: 'alpha-beta' }] });
  assert.equal((await f.check()).reason, 'top-stale');
  const manual = await f.check({ '--match': 'provider-alpha-beta' });
  assert.equal(manual.complete, true);
  assert.equal(manual.top_stale, true);
});
test('manual fallback uses a valid script identity without manufacturing NS status', async t => {
  const f = await fixture(t); await f.complete();
  await f.put('fixtures.json', { matches: [] });
  assert.equal((await f.check({ '--match': 'alpha-beta' })).complete, true);
  await f.put('youtube-scripts/alpha-beta.json', { ...script(match()), scripts: [] });
  const invalid = await f.check({ '--match': 'alpha-beta' });
  assert.equal(invalid.complete, false);
  assert.equal(invalid.reason, 'match-unavailable');
});
test('images-only and clips-only validate their actual resources and effective image model', async t => {
  const f = await fixture(t);
  const { value } = await f.complete(match(), 'custom-agnes-image');
  assert.equal((await f.check({}, { AGNES_IMAGE_MODEL: 'custom-agnes-image' })).complete, true);
  assert.equal((await f.check()).complete, false);
  await f.put('media-pack/alpha-beta.json', { ...value, bankStatus: 'partial', clips: [] });
  assert.equal((await f.check({}, { AGNES_IMAGE_MODEL: 'custom-agnes-image', AGNES_SKIP_VIDEO: '1' })).complete, true);
  await f.put('media-pack/alpha-beta.json', { ...value, bankStatus: 'partial', assets: value.assets.slice(0, 2) });
  assert.equal((await f.check({}, { AGNES_IMAGE_MODEL: 'custom-agnes-image', AGNES_SKIP_IMAGES: '1' })).complete, true);
});
test('adopted clip ordinals three and four follow cycling prompts and retained reference evidence', async t => {
  const f = await fixture(t);
  const { value, videos } = await f.complete();
  value.clips = [3, 4].map((ordinal, index) => ({ ...value.clips[index], id: `alpha-beta-clip-${ordinal}`, file: `clip-${ordinal}.mp4`, url: `https://media.test/alpha-beta/clip-${ordinal}.mp4`, promptHash: hash(videos.prompts[ordinal % 2].prompt), referenceHash: hash(value.assets[3 - index].url) }));
  await f.put('media-pack/alpha-beta.json', value);
  assert.equal((await f.check()).complete, true);
  const invalid = structuredClone(value); invalid.clips[0].file = 'clip-0.mp4';
  await f.put('media-pack/alpha-beta.json', invalid);
  assert.equal((await f.check()).complete, false);
});
test('CLI emits the same stable fields to stdout and GITHUB_OUTPUT and exits two for invalid top', async t => {
  const f = await fixture(t, []);
  await f.put('top.json', { version: 1, generatedAt: new Date().toISOString(), ranking: [] });
  const output = join(f.repo, 'github-output');
  const run = () => spawnSync(process.execPath, [resolve('scripts/check-media-complete.mjs')], { cwd: f.repo, encoding: 'utf8', env: { ...process.env, GOATLAB_REPO: f.repo, GITHUB_OUTPUT: output } });
  const good = run();
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /^complete=true\nreason=no-eligible\neligible=0\npending=0\ntop_age_h=/);
  assert.equal(await readFile(output, 'utf8'), good.stdout);
  await f.put('top.json', { version: 9 });
  const bad = run();
  assert.equal(bad.status, 2);
  assert.match(bad.stdout, /complete=false\nreason=top-invalid/);
  assert.match(mediaCheckOutput({ complete: false, reason: 'top-missing', eligible: 0, pending: 0, top_age_h: null, top_stale: false }), /top_age_h=\ntop_stale=false\n$/);
});
