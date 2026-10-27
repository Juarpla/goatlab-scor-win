import { mediaPolicy } from '../src/lib/media-policy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { generateMediaBanks, mediaRunDeadline, mediaSoftStop } from '../fly/gateway/workspace/skills/goatlab/scripts/generate-media-pack.mjs';
import { buildYoutubeScripts } from '../src/lib/youtube.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const now = Date.parse('2026-10-08T20:00:00Z');
test('fresh runner reports every R2 resource and remote HTTP history without provider requests',async t=>{
  const f=await fixture(t);
  for(let ordinal=0;ordinal<4;ordinal++)f.addPhoto(ordinal);
  for(let i=0;i<4;i++)f.addClip(i);
  const attempts=Array.from({length:5},(_,ordinal)=>({kind:'video',ordinal,state:ordinal<2?'completed':'abandoned',attemptId:'attempt-'+ordinal,
    diagnostics:ordinal<2?null:{queryCount:0,events:[{id:'event-'+ordinal,at:now-60000,runId:'prior-run',runUrl:'',stage:'create',method:'POST',httpStatus:503,providerCode:'video_queue_full',message:'video queue is full',providerStatus:'',progress:null,requestId:'req'}]}}));
  const result=await f.run({transactImpl:async(op,input)=>op==='attempts'?{attempts}:f.transactImpl(op,input)});
  assert.equal(f.provider.length,0);
  assert.equal(result.results[0].resources.length,8);
  assert.ok(result.results[0].resources.every(row=>row.verified&&row.status==='reutilizado'&&row.reason.includes('sin petición a Agnes')));
  assert.equal(result.results[0].attempts[4].diagnostics.events[0].httpStatus,503);
  assert.ok(f.logs.some(line=>line.includes('historial anterior')&&line.includes('video_queue_full')));
  assert.ok(f.logs.some(line=>line.includes('clip 2: reutilizado')));
});
async function fixture(t, overrides = {}, matchId = 'a-b') {
  const repo = await mkdtemp(join(tmpdir(), 'goatlab-generation-')); t.after(() => rm(repo, { recursive: true, force: true }));
  const dir = join(repo, 'public/data/media-pack');
  const match = { id: 'af-1', webId: matchId, home: 'Alpha', away: 'Beta', competition: 'nations', status: 'NS', kickoff: new Date(now + 86_400_000).toISOString() };
  const images = { version: 1, category: 'image-prompts', matchId: matchId, ...match, home: 'Alpha', away: 'Beta', prompts: ['ball-duel', 'goal-action', 'supporters', 'stadium'].map((kind, index) => ({
    n: index + 1, kind, title: kind, prompt: 'Referential photorealistic illustration of Alpha and Beta teams in realistic uniforms, vertical 9:16. ' + kind + ' Stadium flags and team crests. Supporters fans crowd. ' + 'Natural lighting with stable anatomy. '.repeat(6),
  })) };
  const videos = { ...images, category: 'video-prompts', prompts: ['push-in', 'tracking'].map((kind, index) => ({
    n: index + 1, kind, title: kind, prompt: 'Animate the input image with a smooth camera ' + kind + ', 6 seconds, vertical 9:16. ' + 'Keep realistic movement and coherent sports anatomy. '.repeat(6),
  })) };
  await mkdir(dir, { recursive: true });
  for (const category of ['youtube-scripts', 'image-prompts', 'video-prompts']) await mkdir(join(repo, 'public/data', category), { recursive: true });
  await writeFile(join(repo, 'public/data/fixtures.json'), JSON.stringify({ matches: [match] }));
  await writeFile(join(repo, 'public/data/top.json'), JSON.stringify({ version: 1, generatedAt: new Date(now).toISOString(), ranking: [{ id: matchId }], extra: [] }));
  await writeFile(join(repo, `public/data/youtube-scripts/${matchId}.json`), JSON.stringify({ ...buildYoutubeScripts(match), matchId: matchId, home: match.home, away: match.away, competition: match.competition, kickoff: match.kickoff }));
  await writeFile(join(repo, `public/data/image-prompts/${matchId}.json`), JSON.stringify(images));
  await writeFile(join(repo, `public/data/video-prompts/${matchId}.json`), JSON.stringify(videos));
  const env = { MEDIA_ROLE: 'producer', GITHUB_ACTIONS: 'true', GOATLAB_REPO: repo, MEDIA_PACK_DIR: dir, R2_PUBLIC_BASE: 'https://media.test', R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'access', R2_SECRET_ACCESS_KEY: 'secret', AGNES_API_KEY: 'fake', ...overrides };
  const objects = new Map(), calls = [], provider = [], positions=new Map();
  const position=ordinal=>{if(!positions.has(ordinal))positions.set(ordinal,positions.size+1);return positions.get(ordinal);};
  const addPhoto = ordinal => {
    const bytes = Buffer.from('photo-' + ordinal), meta = { model: 'agnes-image-2.5-flash', prompthash: hash(images.prompts[ordinal].prompt), sha256: hash(bytes), width: '1472', height: '2624' };
    objects.set(`partidos/${matchId}/` + ordinal + '.jpg', { bytes, meta });
  };
  const addClip = ordinal => {
    const bytes = Buffer.from('clip-' + ordinal), meta = { model: 'agnes-video-2.5-flash', prompthash: hash(videos.prompts[ordinal % 2].prompt), sha256: hash(bytes), referencehash: hash(env.R2_PUBLIC_BASE + `/partidos/${matchId}/` + ordinal % 4 + '.jpg'), width: '720', height: '1280', duration: '6' };
    const index=position(ordinal);Object.assign(meta,{attemptordinal:String(ordinal),publicationindex:String(index),attemptid:'attempt-'+ordinal});
    objects.set(`partidos/${matchId}/clip-` + index + '.mp4', { bytes, meta });
  };
  let block = false, failPut = false;
  const execImpl = async (_binary, argv, options) => {
    if (argv[0].endsWith('r2-media.mjs')) {
      const [, cmd, ...values] = argv; calls.push({ cmd, values });
      if (cmd === 'budget') return { stdout: JSON.stringify({ level: block ? 'block' : 'ok', operations: { media: { opsA: 1 } } }) };
      if (cmd === 'exists') {
        const object = objects.get(values[0]); return { stdout: JSON.stringify({ found: object ? { key: values[0], bytes: object.bytes.length, meta: object.meta } : false, operations: { media: { opsB: 1 } } }) };
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
    for (let ordinal = 0; ordinal < mediaPolicy(matchId).clips; ordinal++) {
      position(ordinal);
      const file = 'clip-' + ordinal + '.mp4'; await writeFile(join(out, file), 'clip-' + ordinal);
      clips.push({ index: ordinal, file, width: 720, height: 1280, duration: 6, model: 'agnes-video-2.5-flash', prompt: videos.prompts[ordinal % 2].prompt, reference: env.R2_PUBLIC_BASE + `/partidos/${matchId}/` + ordinal + '.jpg', videoId: 'private-task', attemptId: 'private-attempt' });
    }
    return { stdout: JSON.stringify({ clips, failures: [] }) };
  };
  const transactImpl = async (operation, input) => {
    if(operation==='publication-slot')return {publicationIndex:position(input.ordinal)};
    if(operation==='status'&&input.kind==='video'&&!positions.has(input.ordinal))return {slot:null};
    if (operation === 'status') return { slot: { attemptId:'attempt-'+input.ordinal,publicationIndex:positions.get(input.ordinal),uploadClaim: input.kind==='video'&&positions.has(input.ordinal)&&objects.has(`partidos/${matchId}/clip-`+positions.get(input.ordinal)+'.mp4')?{publicationIndex:positions.get(input.ordinal)}:null,state: 'completed', model: 'agnes-' + input.kind + '-2.5-flash', promptHash: hash((input.kind === 'image' ? images : videos).prompts[input.ordinal % (input.kind === 'image' ? 4 : 2)].prompt), referenceHash: hash(env.R2_PUBLIC_BASE + `/partidos/${matchId}/` + input.ordinal % 4 + '.jpg') } };
    return { canPut: true, saved: true };
  };
  const downloads = [], logs = [];
  const run = (overrides = {}) => generateMediaBanks({ env, clock: () => now, execImpl, transactImpl, maintainImpl: async () => ({ deletedIds: [] }), log: message => logs.push(message),
    fetchImpl: async url => { downloads.push(url); const key = 'partidos/' + new URL(url).pathname.split('/partidos/')[1]; const object = objects.get(key); return object ? new Response(object.bytes) : new Response(null, { status: 404 }); },
    ...overrides,
  });
  return { repo, dir, env, calls, provider, downloads, logs, objects, run, execImpl, transactImpl, addPhoto, addClip, setBlock: value => { block = value; }, setFailPut: value => { failPut = value; } };
}
for (const [imageVersion, videoVersion] of [[1, 1], [2, 2], [1, 2], [2, 1]]) {
  test(`generation accepts image v${imageVersion} and video v${videoVersion}`, async t => {
    const f = await fixture(t);
    for (const [category, version] of [['image-prompts', imageVersion], ['video-prompts', videoVersion]]) {
      const path = join(f.repo, 'public/data', category, 'a-b.json');
      const pack = JSON.parse(await readFile(path, 'utf8'));
      await writeFile(path, JSON.stringify({ ...pack, version }));
    }
    const result = await f.run();
    assert.equal(result.completed, 1);
    assert.equal(result.results[0].images, 4);
    assert.equal(result.results[0].clips, 4);
    assert.equal(f.provider.length, 5);
  });
}
test('ready totals combine R2 inventory and confirmed new uploads in logs, progress and JSON', async t => {
  const f = await fixture(t);
  for (const ordinal of [0, 1, 2]) f.addPhoto(ordinal);
  f.addClip(0);
  const result = await f.run();
  assert.equal(result.reused, 4);
  assert.equal(result.generated, 4);
  assert.equal(result.completed, 1);
  assert.ok(f.logs.some(line => line.includes('3/4 imágenes listas; faltan 1 · 1/4 clips listos; faltan 3')));
  assert.ok(f.logs.some(line => line.includes('4/4 imágenes listas; faltan 0 · 1/4 clips listos; faltan 3')));
  assert.ok(f.logs.some(line=>/4\/4 imágenes listas; faltan 0 · 4\/4 clips listos; faltan 0/.test(line)));
  assert.equal(result.outcome.status,'complete');
  const report = JSON.parse(await readFile(join(f.repo, '.cache/media-run.json'), 'utf8'));
  const progress = JSON.parse(await readFile(join(f.dir, 'a-b.progress.json'), 'utf8'));
  assert.equal(report.results[0].images, progress.verifiedImages);
  assert.equal(report.results[0].clips, progress.verifiedClips);
  const summary = spawnSync(process.execPath, [resolve('scripts/media-run-summary.mjs')], {
    cwd: f.repo, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: join(f.repo, 'summary.md') },
  });
  assert.equal(summary.status, 0, summary.stderr);
  assert.match(summary.stdout, /4\/4 imágenes listas; faltan 0/);
  assert.match(summary.stdout, /4\/4 clips listos; faltan 0/);
  assert.match(summary.stdout, /Verificado/);
});
test('local results with failed uploads never appear ready in logs', async t => {
  const f = await fixture(t, { AGNES_SKIP_VIDEO: '1' });
  f.addPhoto(0); f.setFailPut(true);
  const result = await f.run();
  assert.equal(result.results[0].images, 1);
  assert.equal(result.pending, 1);
  assert.match(f.logs.at(-1), /1\/4 imágenes listas; faltan 3/);
  assert.ok(!f.logs.some(line => line.includes('4/4 imágenes listas')));
});
test('duplicate extensions and recovered provider clips do not increase ready totals', async t => {
  const f = await fixture(t);
  for (let ordinal = 0; ordinal < 4; ordinal++) f.addPhoto(ordinal);
  f.objects.set('partidos/a-b/0.png', f.objects.get('partidos/a-b/0.jpg'));
  f.addClip(0);
  const result = await f.run({ execImpl: async (...args) => {
    const response = await f.execImpl(...args);
    if (!args[1][0].endsWith('agnes_video.py')) return response;
    const data = JSON.parse(response.stdout);
    data.clips.push(data.clips[1]);
    return { stdout: JSON.stringify(data) };
  } });
  assert.equal(result.results[0].images, 4);
  assert.equal(result.results[0].clips, 4);
  assert.equal(result.generated, 3);
});
test('expired run budget gives a reason for missing media', async t => {
  const f = await fixture(t, { MEDIA_RUN_BUDGET_MS: '0' });
  const result = await f.run();
  assert.equal(f.provider.length, 0);
  assert.ok(result.results[0].failures.some(reason => /presupuesto.*agotado/i.test(reason)));
});
test('a match starting after selection gives a generation window diagnostic', async t => {
  const f = await fixture(t);
  let current = now;
  const result = await f.run({ clock: () => current, transactImpl: async operation => {
    if (operation === 'heartbeat') current = now + 86_400_001;
    return {};
  } });
  assert.equal(f.provider.length, 0);
  assert.ok(result.results[0].failures.some(reason => /ventana/i.test(reason)));
});
test('an invalid fingerprint is explicitly reported for a manual run', async t => {
  const f = await fixture(t);
  const path = join(f.repo, 'public/data/image-prompts/a-b.json');
  const pack = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...pack, version: 9 }));
  const result = await f.run({ args: { '--match': 'a-b' } });
  assert.equal(f.provider.length, 0);
  assert.ok(result.results[0].failures.some(reason => /huella.*inválida/i.test(reason)));
});
test('losing the private heartbeat pauses generation and records a sanitized diagnostic', async t => {
  const f = await fixture(t);
  let heartbeat, beats = 0, ticked = false;
  t.mock.method(globalThis, 'setInterval', callback => { heartbeat = callback; return { unref() {} }; });
  t.mock.method(globalThis, 'clearInterval', () => {});
  const result = await f.run({
    transactImpl: async operation => {
      if (operation === 'heartbeat' && ++beats > 1) throw new Error('state unavailable fake');
      return {};
    },
    execImpl: async (...args) => {
      if (!ticked && args[1][1] === 'exists') {
        ticked = true; heartbeat();
        await new Promise(resolve => setImmediate(resolve));
      }
      return f.execImpl(...args);
    },
  });
  assert.equal(f.provider.length, 0);
  assert.equal(result.pending, 1);
  assert.ok(result.results[0].failures.some(reason => /Estado privado.*no disponible/i.test(reason)));
  assert.doesNotMatch(JSON.stringify(result.results[0]), /fake/);
  const progress = JSON.parse(await readFile(join(f.dir, 'a-b.progress.json'), 'utf8'));
  assert.deepEqual(progress.failures, result.results[0].failures);
});
test('incompatible R2 metadata and rejected generated clips never increase ready totals', async t => {
  const f = await fixture(t, { AGNES_SKIP_IMAGES: '1' });
  for (let ordinal = 0; ordinal < 4; ordinal++) f.addPhoto(ordinal);
  f.addClip(0);
  f.objects.get('partidos/a-b/clip-1.mp4').meta.prompthash = hash('old prompt');
  const result = await f.run({ execImpl: async (...args) => {
    const response = await f.execImpl(...args);
    if (!args[1][0].endsWith('agnes_video.py')) return response;
    const data = JSON.parse(response.stdout);
    for (const clip of data.clips) clip.promptHash = hash('old prompt');
    return { stdout: JSON.stringify(data) };
  } });
  assert.equal(result.results[0].clips, 0);
  assert.match(f.logs.at(-1), /0\/4 clips listos; faltan 4/);
  assert.ok(result.results[0].failures.some(reason => /identidad/.test(reason)));
  assert.equal(f.provider.length,0);
});
test('heartbeat loss during image uploads prevents the next provider call', async t => {
  const f = await fixture(t, { AGNES_SKIP_VIDEO: '1' });
  let heartbeat, beats = 0, ticked = false;
  t.mock.method(globalThis, 'setInterval', callback => { heartbeat = callback; return { unref() {} }; });
  t.mock.method(globalThis, 'clearInterval', () => {});
  const result = await f.run({
    transactImpl: async (...args) => {
      if (args[0] === 'heartbeat' && ++beats > 1) throw new Error('state unavailable');
      return f.transactImpl(...args);
    },
    execImpl: async (...args) => {
      if (!ticked && args[1][1] === 'put') {
        ticked = true; heartbeat();
        await new Promise(resolve => setImmediate(resolve));
      }
      return f.execImpl(...args);
    },
  });
  assert.equal(f.provider.length, 1);
  assert.equal(result.results[0].images, 1);
  assert.equal(result.pending, 1);
  assert.ok(result.results[0].failures.some(reason => /Estado privado.*no disponible/i.test(reason)));
});
test('a provider producing no clips gives an incomplete-resource diagnostic', async t => {
  const f = await fixture(t, { AGNES_SKIP_IMAGES: '1' });
  for (let ordinal = 0; ordinal < 4; ordinal++) f.addPhoto(ordinal);
  const result = await f.run({ execImpl: async (...args) => args[1][0].endsWith('agnes_video.py')
    ? { stdout: JSON.stringify({ clips: [], failures: [] }) } : f.execImpl(...args) });
  assert.equal(result.pending, 1);
  assert.ok(result.results[0].failures.some(reason => /Recursos incompletos/.test(reason)));
});
test('run budget is ephemeral and bounded by kickoff plus 24h, with invalid kickoff refusing generation', () => {
  assert.equal(mediaRunDeadline(now, {}), now + 3_000_000);
  assert.equal(mediaRunDeadline(now, { MEDIA_RUN_BUDGET_MS: '0' }), now);
  assert.equal(mediaSoftStop(now + 3_000_000, new Date(now - 86_400_000 + 1000).toISOString()), now + 1000);
  assert.equal(mediaSoftStop(now + 3_000_000, 'invalid'), 0);
});
test('R2 block reuses the two publication positions with their original attempt ordinals and makes zero provider calls or media PUTs', async t => {
  const f = await fixture(t, { MEDIA_RUN_BUDGET_MS: '0' }); for (let i = 0; i < 4; i++) f.addPhoto(i); f.addClip(3); f.addClip(4); f.setBlock(true);
  const result = await f.run();
  assert.equal(f.provider.length, 0); assert.equal(f.calls.filter(c => c.cmd === 'put').length, 0);
  assert.equal(result.completed, 0); assert.equal(result.reused, 6);
  assert.ok(f.logs.some(line=>/4\/4 imágenes listas; faltan 0 · 2\/4 clips listos; faltan 2/.test(line)));
  assert.equal(result.outcome.status,'error');
  assert.equal(f.logs.filter(line => line.startsWith('media: a-b:')).length, 2);
  const manifest = JSON.parse(await readFile(join(f.dir, 'a-b.json'), 'utf8'));
  assert.equal(manifest.bankVersion, 2); assert.equal(manifest.bankStatus, 'partial');
  assert.deepEqual(manifest.clips.map(c => c.file), ['clip-1.mp4', 'clip-2.mp4']);
  const progress = JSON.parse(await readFile(join(f.dir, 'a-b.progress.json'), 'utf8'));
  assert.equal(progress.verifiedImages, 4); assert.equal(progress.verifiedClips, 2);
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
  assert.equal(manifest.assets.length, 0); assert.equal(manifest.bankStatus, 'partial');
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
  const f=await fixture(t,{MEDIA_RUN_BUDGET_MS:'0'}); for(let i=0;i<4;i++) {f.addPhoto(i);delete f.objects.get('partidos/a-b/'+i+'.jpg').meta.width;} for(let i=0;i<4;i++)f.addClip(i);
  const result=await f.run(); assert.equal(result.completed,0); assert.equal(f.provider.length,0);
});
test('images-only verification still leaves a bank partial until its four clips exist', async t => {
  const f=await fixture(t,{AGNES_SKIP_VIDEO:'1',MEDIA_RUN_BUDGET_MS:'0'});for(let i=0;i<4;i++) f.addPhoto(i);
  const result=await f.run();assert.equal(result.completed,1);assert.equal(result.pending,0);assert.deepEqual(result.completedIds,[]);
  assert.equal(JSON.parse(await readFile(join(f.dir,'a-b.json'))).bankStatus,'partial');
});

test('publication verifies HEAD and stores the R2 identity before removing local media', async t => {
  const f = await fixture(t);
  const events = [];
  const result = await f.run({ transactImpl: async (op, input) => {
    events.push({op,input}); return f.transactImpl(op,input);
  }});
  assert.equal(result.completed, 1);
  const confirms = events.filter(e=>e.op==='uploadconfirm');
  assert.equal(confirms.length, 8);
  for(const {input} of confirms) {
    assert.match(input.objectKey, /^partidos\/a-b\/(?:[0-3]\.jpg|clip-[0-4]\.mp4)$/);
    assert.ok(input.sizeBytes > 0);
    const names = await readdir(join(f.dir,'gen','a-b'));
    assert.ok(!names.includes(input.objectKey.split('/').at(-1)));
  }
  const commands=f.calls.map(c=>c.cmd);
  for(let i=0;i<commands.length;i++) if(commands[i]==='put') assert.equal(commands[i+1],'exists');
});
for(const defect of ['missing','wrong-key','wrong-size','wrong-hash','wrong-model','wrong-prompt','wrong-dimensions']) {
  test(`a successful PUT with ${defect} HEAD evidence remains unavailable`, async t => {
    const f=await fixture(t,{AGNES_SKIP_VIDEO:'1'}); const confirmations=[];const uploaded=new Set();
    const result=await f.run({execImpl:async(binary,argv,options)=>{
      const response=await f.execImpl(binary,argv,options);
      if(argv[1]==='put') uploaded.add(argv[3]);
      if(argv[1]==='exists' && uploaded.has(argv[2])) {
        const data=JSON.parse(response.stdout);
        if(defect==='missing') data.found=false;
        if(defect==='wrong-key') data.found.key='partidos/other/0.jpg';
        if(defect==='wrong-size') data.found.bytes++;
        if(defect==='wrong-hash') data.found.meta.sha256=hash('different');
        if(defect==='wrong-model') data.found.meta.model='other';
        if(defect==='wrong-prompt') data.found.meta.prompthash=hash('other');
        if(defect==='wrong-dimensions') data.found.meta.width='12';
        return {stdout:JSON.stringify(data)};
      }
      return response;
    },transactImpl:async(op,input)=>{if(op==='uploadconfirm') confirmations.push(input);return f.transactImpl(op,input);}});
    assert.equal(result.results[0].images,0);assert.equal(result.completed,0);
    assert.equal(confirmations.length,0);
    assert.ok((await readdir(join(f.dir,'gen','a-b'))).includes('0.jpg'));
  });
}
test('an empty runner continues from two R2 images without regenerating them',async t=>{
  const f=await fixture(t);f.addPhoto(0);f.addPhoto(1);
  const result=await f.run();assert.equal(result.completed,1);
  assert.equal(f.provider.filter(p=>p.endsWith('agnes.py')).length,2);
  assert.equal(f.provider.filter(p=>p.endsWith('agnes_video.py')).length,1);
  assert.equal((await readdir(join(f.dir,'gen','a-b'))).some(n=>/\.(?:jpg|png|mp4|response\.json|accepted\.json)$/.test(n)),false);
});
test('existing R2 objects reconcile missing upload confirmations without another PUT',async t=>{
  const f=await fixture(t,{MEDIA_RUN_BUDGET_MS:'0'});for(let i=0;i<4;i++)f.addPhoto(i);for(let i=0;i<4;i++)f.addClip(i);
  const confirmed=[];
  const result=await f.run({transactImpl:async(op,input)=>{if(op==='uploadconfirm')confirmed.push(input);return f.transactImpl(op,input);}});
  assert.equal(result.completed,1);assert.equal(confirmed.length,8);
  assert.equal(f.calls.some(c=>c.cmd==='put'),false);assert.equal(f.provider.length,0);
});
test('clips never use images whose publication failed',async t=>{
  const f=await fixture(t);f.setFailPut(true);await f.run();
  assert.equal(f.provider.some(p=>p.endsWith('agnes_video.py')),false);
});

test('a pending match outside selection is recovered before generation with no new POST',async t=>{
  const f=await fixture(t);for(let i=0;i<4;i++)f.addPhoto(i);
  const fixtures=JSON.parse(await readFile(join(f.repo,'public/data/fixtures.json')));
  fixtures.matches[0].status='LIVE';await writeFile(join(f.repo,'public/data/fixtures.json'),JSON.stringify(fixtures));
  const result=await f.run({args:{'--limit':'1'},transactImpl:async(op,input)=>{
    if(op==='recoverable-videos')return {tasks:[{matchId:'a-b',ordinal:1,expiresAtMs:now+86_400_000}]};
    return f.transactImpl(op,input);
  },execImpl:async(binary,argv,options)=>{
    if(argv[0].endsWith('agnes_video.py')) {
      const input=JSON.parse(await readFile(argv.find(a=>a.startsWith('--input=')).slice(8)));
      assert.equal(input.recoverOnly,true);assert.ok(input.deadline<=now/1000+60);
    }
    return f.execImpl(binary,argv,options);
  }});
  assert.equal(result.results[0].matchId,'a-b');assert.equal(result.results[0].clips,4);
  assert.equal(f.provider.length,1);assert.ok(f.provider[0].endsWith('agnes_video.py'));
});

test('HEAD transport failure leaves the object unconfirmed and pauses new generation',async t=>{
  const f=await fixture(t,{AGNES_SKIP_VIDEO:'1'});let uploaded=false;const confirms=[];
  const result=await f.run({execImpl:async(binary,argv,options)=>{
    if(argv[1]==='exists' && uploaded)throw new Error('HEAD unavailable');
    const response=await f.execImpl(binary,argv,options);if(argv[1]==='put')uploaded=true;return response;
  },transactImpl:async(op,input)=>{if(op==='uploadconfirm')confirms.push(input);return f.transactImpl(op,input);}});
  assert.equal(result.results[0].images,0);assert.equal(confirms.length,0);
  assert.equal(f.provider.length,1);
});
test('temporary cleanup failure keeps the verified resource ready and never causes another POST',async t=>{
  const f=await fixture(t,{AGNES_SKIP_VIDEO:'1'});
  const run=await f.run({execImpl:async(...args)=>{
    const response=await f.execImpl(...args);
    if(args[1][0].endsWith('agnes.py')) {
      const out=args[1].find(a=>a.startsWith('--out=')).slice(6);
      await mkdir(join(out,'0.response.json'),{recursive:true});
    }
    return response;
  }});
  assert.equal(run.results[0].images,4);assert.equal(run.completed,1);
  assert.ok(f.logs.some(line=>line.includes('limpieza temporal pendiente')));
  const calls=f.provider.length;f.env.MEDIA_RUN_BUDGET_MS='0';
  const retry=await f.run();assert.equal(retry.results[0].images,4);assert.equal(f.provider.length,calls);
});
test('the workflow stores reports but never restores or archives media between runs',async()=>{
  const workflow=await readFile(resolve('.github/workflows/media-bank.yml'),'utf8');
  assert.ok(!/agnes-recovery|media-recovery|actions\/cache\/(?:save|restore)/.test(workflow));
  assert.match(workflow,/name: goatlab-media-bank/);
  assert.match(workflow,/rm -rf public\/data\/media-pack\/gen/);
});

test('confirmed publication removes orphaned atomic response files as well as binaries',async t=>{
  const f=await fixture(t,{AGNES_SKIP_VIDEO:'1'});
  await f.run({execImpl:async(...args)=>{
    const response=await f.execImpl(...args);
    if(args[1][0].endsWith('agnes.py')) {
      const out=args[1].find(a=>a.startsWith('--out=')).slice(6);
      const ordinal=args[1].find(a=>a.startsWith('--index=')).slice(8);
      await writeFile(join(out,ordinal+'.response.json.42.tmp'),'private response');
    }
    return response;
  }});
  assert.equal((await readdir(join(f.dir,'gen','a-b'))).some(n=>n.endsWith('.tmp')),false);
});
test('a fifth attempt publishes clip-1 and a recovered clip is not named after its attempt',async t=>{
  const f=await fixture(t);for(let i=0;i<4;i++)f.addPhoto(i);
  const result=await f.run({transactImpl: async(op,input) => {
    if(op==='status' && input.kind==='video' && input.ordinal===4) {
      const existing=await f.transactImpl(op,{...input,ordinal:0});
      return {slot:{...existing.slot,attemptId:'attempt-4',publicationIndex:1,uploadClaim:null}};
    }
    if(op==='publication-slot' && input.ordinal===4)return {publicationIndex:1};
    return f.transactImpl(op,input);
  },execImpl:async(binary,argv,options)=>{
    const response=await f.execImpl(binary,argv,options);
    if(!argv[0].endsWith('agnes_video.py'))return response;
    const data=JSON.parse(response.stdout),out=argv.find(value=>value.startsWith('--out=')).slice(6);
    const clip={...data.clips[0],index:4,file:'clip-4.mp4'};await writeFile(join(out,clip.file),'clip-4');
    return {stdout:JSON.stringify({...data,clips:[clip]})};
  }});
  assert.equal(result.results[0].clips,1);
  assert.ok(f.objects.has('partidos/a-b/clip-1.mp4'));assert.ok(!f.objects.has('partidos/a-b/clip-4.mp4'));
  assert.equal(f.objects.get('partidos/a-b/clip-1.mp4').meta.attemptordinal,'4');
  assert.equal(f.objects.get('partidos/a-b/clip-1.mp4').meta.publicationindex,'1');
});
test('provider-only match identifiers are omitted without failing the rest of the run',async t=>{
  const f=await fixture(t);
  for(let ordinal=0;ordinal<4;ordinal++)f.addPhoto(ordinal);
  for(let i=0;i<4;i++)f.addClip(i);
  const fixturesPath=join(f.repo,'public/data/fixtures.json');
  const fixtures=JSON.parse(await readFile(fixturesPath));
  fixtures.matches.push({...fixtures.matches[0],id:'fd-9',webId:null});
  await writeFile(fixturesPath,JSON.stringify(fixtures));
  const topPath=join(f.repo,'public/data/top.json');
  const top=JSON.parse(await readFile(topPath));
  top.ranking.push({id:'fd-9'});
  await writeFile(topPath,JSON.stringify(top));
  const result=await f.run();
  assert.equal(result.completed,1);assert.equal(result.pending,0);assert.equal(result.outcome.exitCode,0);
  assert.equal(result.results.some(row=>row.matchId==='fd-9'),false);
  assert.equal(f.provider.length,0);assert.equal(f.calls.filter(call=>call.cmd==='put').length,0);
  assert.ok(f.logs.some(line=>line.includes('fd-9')&&line.includes('omitido')));
  const manual=await f.run({args:{'--match':'fd-9'}});
  assert.equal(manual.results.length,0);assert.equal(manual.outcome.exitCode,0);assert.equal(f.provider.length,0);
});


test('current provider saturation persists in report and summary without an execution failure',async t=>{
  const f=await fixture(t);for(let i=0;i<4;i++)f.addPhoto(i);
  let runId,called=false;
  const result=await f.run({
    transactImpl:async(op,input)=>{
      if(op==='heartbeat')runId=input.runId;
      if(op==='attempts')return {attempts:called?[1,2,3,4].map(publicationIndex=>({kind:'video',ordinal:publicationIndex-1,publicationIndex,state:'abandoned',diagnostics:{events:[{runId,method:'POST',stage:'create',httpStatus:503,providerCode:'video_queue_full',message:'video queue is full'}]}})):[]};
      return f.transactImpl(op,input);
    },
    execImpl:async(binary,args,options)=>{
      if(args[0].endsWith('agnes_video.py')){called=true;return {stdout:JSON.stringify({clips:[],failures:['clip 1: HTTP 503','clip 2: HTTP 503'],runPosts:{'1':1,'2':1}})};}
      return f.execImpl(binary,args,options);
    },
  });
  assert.equal(result.pending,1);assert.equal(result.completed,0);assert.equal(result.outcome.exitCode,0);
  const publication=JSON.parse(await readFile(join(f.repo,'.cache/media-publication.json'),'utf8'));
  assert.equal(publication.allow_commit,false);
  const summary=spawnSync(process.execPath,[resolve('scripts/media-run-summary.mjs')],{cwd:f.repo,encoding:'utf8'});
  assert.equal(summary.status,0);assert.match(summary.stdout,/finalizado con recursos pendientes por condiciones temporales/);
  assert.match(summary.stdout,/503.*video_queue_full/);assert.match(summary.stdout,/0\/4 clips listos/);
});

test('manual media generation never runs terminal maintenance or deletes another bank', async t => {
  const f = await fixture(t);
  const other = join(f.dir, 'another-match.json');
  await writeFile(other, '{"preserve":true}');
  const result = await f.run({ args: { '--match': 'a-b' }, maintainImpl: async () => { throw new Error('Generation must not perform maintenance'); } });
  assert.deepEqual(result.deletedIds, []);
  assert.equal(await readFile(other, 'utf8'), '{"preserve":true}');
});

test('generation needs no video prompt document and preserves proven historical clips', async t => {
  const f = await fixture(t);
  for (let ordinal=0; ordinal<4; ordinal++) f.addPhoto(ordinal);
  for(let i=0;i<4;i++) f.addClip(i);
  await rm(join(f.repo, 'public/data/video-prompts'), { recursive: true });
  const result = await f.run();
  assert.equal(result.completed, 1);
  assert.equal(result.reused, 8);
  assert.equal(f.provider.length, 0);
});

test('new video input passes images and no generated prompts to the production adapter', async t => {
  const f = await fixture(t);
  await rm(join(f.repo, 'public/data/video-prompts'), { recursive: true });
  let input;
  const result = await f.run({execImpl: async(binary, argv, options) => {
    if (argv[0].endsWith('agnes_video.py')) input = JSON.parse(await readFile(argv.find(a=>a.startsWith('--input=')).slice(8)));
    return f.execImpl(binary, argv, options);
  }});
  assert.equal(result.completed, 1);
  assert.equal(input.prompts, undefined);
  assert.equal(input.images.length, 4);
});

test('freedom adds only the missing fourth clip and preserves all verified R2 objects', async t => {
  const matchId = 'levante-ud-vs-atletico-madrid-2026-10-31';
  const f = await fixture(t, { AGNES_SKIP_IMAGES: '1' }, matchId);
  for (let i=0; i<4; i++) f.addPhoto(i);
  for(let i=0;i<3;i++) f.addClip(i);
  const original = new Map([...f.objects].map(([key, object]) => [key, object.meta.sha256]));
  const result = await f.run();
  assert.equal(result.completed, 1);
  assert.equal(result.generated, 1);
  assert.equal(result.results[0].clips, 4);
  assert.equal(f.provider.length, 1);
  assert.ok(f.provider[0].endsWith('agnes_video.py'));
  assert.equal(result.results[0].resources.length, 8);
  for (const [key, checksum] of original) assert.equal(f.objects.get(key).meta.sha256, checksum);
  assert.deepEqual(f.calls.filter(c => c.cmd === 'put').map(c => c.values[1]), ['partidos/'+matchId+'/clip-4.mp4']);
  assert.equal((await f.run()).generated, 0);
  assert.equal(f.provider.length, 1);
});
