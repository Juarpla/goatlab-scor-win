import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { generateMediaBanks, mediaRunDeadline, mediaSoftStop } from '../fly/gateway/workspace/skills/goatlab/scripts/generate-media-pack.mjs';
import { buildYoutubeScripts } from '../src/lib/youtube.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const now = Date.parse('2026-10-08T20:00:00Z');
async function fixture(t, overrides = {}) {
  const repo = await mkdtemp(join(tmpdir(), 'goatlab-generation-')); t.after(() => rm(repo, { recursive: true, force: true }));
  const dir = join(repo, 'public/data/media-pack');
  const match = { id: 'af-1', webId: 'a-b', home: 'Alpha', away: 'Beta', competition: 'nations', status: 'NS', kickoff: new Date(now + 86_400_000).toISOString() };
  const images = { version: 1, category: 'image-prompts', matchId: 'a-b', ...match, home: 'Alpha', away: 'Beta', prompts: ['ball-duel', 'goal-action', 'supporters', 'stadium'].map((kind, index) => ({
    n: index + 1, kind, title: kind, prompt: 'Referential photorealistic illustration of Alpha and Beta teams in realistic uniforms, vertical 9:16. ' + kind + ' Stadium flags and team crests. Supporters fans crowd. ' + 'Natural lighting with stable anatomy. '.repeat(6),
  })) };
  const videos = { ...images, category: 'video-prompts', prompts: ['push-in', 'tracking'].map((kind, index) => ({
    n: index + 1, kind, title: kind, prompt: 'Animate the input image with a smooth camera ' + kind + ', 6 seconds, vertical 9:16. ' + 'Keep realistic movement and coherent sports anatomy. '.repeat(6),
  })) };
  await mkdir(dir, { recursive: true });
  for (const category of ['youtube-scripts', 'image-prompts', 'video-prompts']) await mkdir(join(repo, 'public/data', category), { recursive: true });
  await writeFile(join(repo, 'public/data/fixtures.json'), JSON.stringify({ matches: [match] }));
  await writeFile(join(repo, 'public/data/top.json'), JSON.stringify({ version: 1, generatedAt: new Date(now).toISOString(), ranking: [{ id: 'a-b' }], extra: [] }));
  await writeFile(join(repo, 'public/data/youtube-scripts/a-b.json'), JSON.stringify({ ...buildYoutubeScripts(match), matchId: 'a-b', home: match.home, away: match.away, competition: match.competition, kickoff: match.kickoff }));
  await writeFile(join(repo, 'public/data/image-prompts/a-b.json'), JSON.stringify(images));
  await writeFile(join(repo, 'public/data/video-prompts/a-b.json'), JSON.stringify(videos));
  const env = { GOATLAB_REPO: repo, MEDIA_PACK_DIR: dir, R2_PUBLIC_BASE: 'https://media.test', R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'access', R2_SECRET_ACCESS_KEY: 'secret', AGNES_API_KEY: 'fake', ...overrides };
  const objects = new Map(), calls = [], provider = [];
  const addPhoto = ordinal => {
    const bytes = Buffer.from('photo-' + ordinal), meta = { model: 'agnes-image-2.5-flash', prompthash: hash(images.prompts[ordinal].prompt), sha256: hash(bytes), width: '1472', height: '2624' };
    objects.set('partidos/a-b/' + ordinal + '.jpg', { bytes, meta });
  };
  const addClip = ordinal => {
    const bytes = Buffer.from('clip-' + ordinal), meta = { model: 'agnes-video-2.5-flash', prompthash: hash(videos.prompts[ordinal % 2].prompt), sha256: hash(bytes), referencehash: hash(env.R2_PUBLIC_BASE + '/partidos/a-b/' + ordinal % 4 + '.jpg'), width: '720', height: '1280', duration: '6' };
    objects.set('partidos/a-b/clip-' + ordinal + '.mp4', { bytes, meta });
  };
  let block = false, failPut = false;
  const execImpl = async (_binary, argv, options) => {
    if (argv[0].endsWith('r2-media.mjs')) {
      const [, cmd, ...values] = argv; calls.push({ cmd, values });
      if (cmd === 'budget') return { stdout: JSON.stringify({ level: block ? 'block' : 'ok', operations: { media: { opsA: 1 } } }) };
      if (cmd === 'exists') {
        const object = objects.get(values[0]); return { stdout: JSON.stringify({ found: object ? { meta: object.meta } : false, operations: { media: { opsB: 1 } } }) };
      }
      if (cmd === 'put') {
        if (failPut) throw new Error('PUT failed');
        const bytes = await readFile(values[0]), meta = Object.fromEntries(values.slice(3).map(v => { const i = v.indexOf('='); return [v.slice(0, i), v.slice(i + 1)]; }));
        objects.set(values[1], { bytes, meta }); return { stdout: JSON.stringify({ key: values[1], operations: { media: { opsA: 1 } } }) };
      }
      return { stdout: '{}' };
    }
    provider.push(argv[0]);
    const out = argv.find(value => value.startsWith('--out=')).slice(6);
    if (argv[0].endsWith('agnes.py')) {
      const ordinal = Number(argv.find(value => value.startsWith('--index=')).slice(8));
      const file = ordinal + '.jpg'; await writeFile(join(out, file), 'photo-' + ordinal);
      return { stdout: JSON.stringify({ file, model: 'agnes-image-2.5-flash', prompt: images.prompts[ordinal].prompt, width: 1472, height: 2624, at: new Date(now).toISOString(), attemptId: 'private-attempt' }) };
    }
    const clips = [];
    for (let ordinal = 0; ordinal < 2; ordinal++) {
      const file = 'clip-' + ordinal + '.mp4'; await writeFile(join(out, file), 'clip-' + ordinal);
      clips.push({ index: ordinal, file, width: 720, height: 1280, duration: 6, model: 'agnes-video-2.5-flash', prompt: videos.prompts[ordinal].prompt, reference: env.R2_PUBLIC_BASE + '/partidos/a-b/' + ordinal + '.jpg', videoId: 'private-task', attemptId: 'private-attempt' });
    }
    return { stdout: JSON.stringify({ clips, failures: [] }) };
  };
  const transactImpl = async (operation, input) => {
    if (operation === 'status') return { slot: { state: 'completed', model: 'agnes-' + input.kind + '-2.5-flash', promptHash: hash((input.kind === 'image' ? images : videos).prompts[input.ordinal % (input.kind === 'image' ? 4 : 2)].prompt), referenceHash: hash(env.R2_PUBLIC_BASE + '/partidos/a-b/' + input.ordinal % 4 + '.jpg') } };
    return { canPut: true, saved: true };
  };
  const downloads = [];
  const run = (overrides = {}) => generateMediaBanks({ env, clock: () => now, execImpl, transactImpl, maintainImpl: async () => ({ deletedIds: [] }), log: () => {},
    fetchImpl: async url => { downloads.push(url); const key = 'partidos/' + new URL(url).pathname.split('/partidos/')[1]; const object = objects.get(key); return object ? new Response(object.bytes) : new Response(null, { status: 404 }); },
    ...overrides,
  });
  return { repo, dir, env, calls, provider, downloads, objects, run, execImpl, addPhoto, addClip, setBlock: value => { block = value; }, setFailPut: value => { failPut = value; } };
}
test('run budget is ephemeral and bounded by kickoff plus 24h, with invalid kickoff refusing generation', () => {
  assert.equal(mediaRunDeadline(now, {}), now + 3_000_000);
  assert.equal(mediaRunDeadline(now, { MEDIA_RUN_BUDGET_MS: '0' }), now);
  assert.equal(mediaSoftStop(now + 3_000_000, new Date(now - 86_400_000 + 1000).toISOString()), now + 1000);
  assert.equal(mediaSoftStop(now + 3_000_000, 'invalid'), 0);
});
test('R2 block reuses verified media, searches all five clip ordinals and makes zero provider calls or media PUTs', async t => {
  const f = await fixture(t, { MEDIA_RUN_BUDGET_MS: '0' }); for (let i = 0; i < 4; i++) f.addPhoto(i); f.addClip(3); f.addClip(4); f.setBlock(true);
  const result = await f.run();
  assert.equal(f.provider.length, 0); assert.equal(f.calls.filter(c => c.cmd === 'put').length, 0);
  assert.equal(result.completed, 1); assert.equal(result.reused, 6);
  const manifest = JSON.parse(await readFile(join(f.dir, 'a-b.json'), 'utf8'));
  assert.equal(manifest.bankVersion, 2); assert.equal(manifest.bankStatus, 'complete');
  assert.deepEqual(manifest.clips.map(c => c.file), ['clip-3.mp4', 'clip-4.mp4']);
});
test('negative HEAD never downloads a missing object', async t => {
  const f = await fixture(t, { AGNES_API_KEY: '' }); await f.run(); assert.equal(f.downloads.length, 0);
});
test('clips-only generates clips using reused images independently of image generation', async t => {
  const f = await fixture(t, { AGNES_SKIP_IMAGES: '1' }); for (let i = 0; i < 4; i++) f.addPhoto(i);
  const result = await f.run(); assert.equal(result.completed, 1);
  assert.equal(f.provider.length, 1); assert.ok(f.provider[0].endsWith('agnes_video.py'));
  const text = await readFile(join(f.dir, 'a-b.json'), 'utf8');
  assert.equal(text.includes('private-task') || text.includes('private-attempt'), false);
});
test('failed PUT never publishes a complete bank even when four local results exist', async t => {
  const f = await fixture(t, { AGNES_SKIP_VIDEO: '1' }); f.setFailPut(true);
  const result = await f.run(); assert.equal(result.completed, 0); assert.equal(result.pending, 1);
  const manifest = JSON.parse(await readFile(join(f.dir, 'a-b.json'), 'utf8'));
  assert.equal(manifest.assets.length, 4); assert.equal(manifest.bankStatus, 'partial');
});
test('stale or corrupt top fails before provider calls', async t => {
  const f = await fixture(t);
  await writeFile(join(f.repo, 'public/data/top.json'), JSON.stringify({ version: 1, generatedAt: new Date(now - 8 * 3_600_000).toISOString(), ranking: [], extra: [] }));
  await assert.rejects(f.run(), /stale/);
  assert.equal(f.provider.length, 0);
});
test('wrong prompt identity prevents any new provider calls', async t => {
  const f = await fixture(t);
  const path = join(f.repo, 'public/data/image-prompts/a-b.json');
  const pack = JSON.parse(await readFile(path, 'utf8')); pack.home = 'Other';
  await writeFile(path, JSON.stringify(pack));
  const result = await f.run(); assert.equal(result.eligible, 0); assert.equal(f.provider.length, 0);
});
test('draft partial does not publish its manifest and reports no complete IDs', async t => {
  const f = await fixture(t, { MEDIA_DRAFT: '1', AGNES_SKIP_VIDEO: '1' }); f.setFailPut(true);
  await f.run();
  await assert.rejects(readFile(join(f.dir, 'a-b.json')), /ENOENT/);
  const publication = JSON.parse(await readFile(join(f.repo, '.cache/media-publication.json')));
  assert.deepEqual(publication.complete_ids, []); assert.equal(publication.allow_commit, false);
});
test('recovered clips from older prompt hashes remain unpublished and are never uploaded as current content', async t => {
  const f = await fixture(t, { AGNES_SKIP_IMAGES: '1' }); for (let i=0;i<4;i++) f.addPhoto(i);
  const result = await f.run({execImpl: async (binary,argv,options) => {
    const response=await f.execImpl(binary,argv,options);
    if(argv[0].endsWith('agnes_video.py')) { const data=JSON.parse(response.stdout); for(const clip of data.clips) clip.promptHash=hash('old prompt'); return {stdout:JSON.stringify(data)}; }
    return response;
  }});
  assert.equal(result.completed,0);
  assert.equal(f.calls.some(call=>call.cmd==='put' && call.values[1].includes('clip-')),false);
});
test('missing image dimension evidence cannot certify a complete bank', async t => {
  const f=await fixture(t,{MEDIA_RUN_BUDGET_MS:'0'}); for(let i=0;i<4;i++) {f.addPhoto(i);delete f.objects.get('partidos/a-b/'+i+'.jpg').meta.width;} f.addClip(0);f.addClip(1);
  const result=await f.run(); assert.equal(result.completed,0); assert.equal(f.provider.length,0);
});
test('images-only verification still leaves a bank partial until its two clips exist', async t => {
  const f=await fixture(t,{AGNES_SKIP_VIDEO:'1',MEDIA_RUN_BUDGET_MS:'0'});for(let i=0;i<4;i++) f.addPhoto(i);
  const result=await f.run();assert.equal(result.completed,0);
  assert.equal(JSON.parse(await readFile(join(f.dir,'a-b.json'))).bankStatus,'partial');
});
