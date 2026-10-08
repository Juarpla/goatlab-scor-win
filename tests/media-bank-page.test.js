import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mediaBankIds, readMediaBank } from '../src/lib/media-bank.js';

const run = promisify(execFile);

function asset(id, url = `https://goatlab-gateway.fly.dev/media-gen/a-b/${id}.jpg`) {
  return { source: 'agnes', id, url, width: 1472, height: 2624, query: 'prompt', generated: { model: 'agnes-image-2.5-flash', at: new Date().toISOString() } };
}
function clip(file, url = `https://goatlab-gateway.fly.dev/media-gen/a-b/${file}`) {
  return { id: `a-b-clip-0`, source: 'agnes', file, url, width: 720, height: 1280, duration: 6, model: 'agnes-video-2.5-flash' };
}

test('readMediaBank sanea al contrato 4 fotos + 2 clips y conserva los fallos', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'media-bank-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const assets = [asset('a-b-0'), asset('a-b-1'), asset('a-b-2'), asset('a-b-3'), asset('a-b-4'),
    { source: 'external', id: 'x', url: 'https://photos.test/x.jpg' },
    { source: 'agnes', id: 'bad', url: 'notaurl' }];
  const clips = [clip('clip-0.mp4'), clip('clip-1.mp4'), { ...clip('clip-2.mp4'), url: undefined, file: 'clip-2.mp4' }];
  await writeFile(join(dir, 'a-b.json'), JSON.stringify({ matchId: 'a-b', match: 'A vs B', home: 'A', away: 'B', bankStatus: 'complete', attribution: 'IA (Agnes AI)', assets, clips }));
  await writeFile(join(dir, 'a-b.progress.json'), JSON.stringify({ count: 4, target: 4, clips: 2, failures: ['clip 1: HTTP 503'], phase: 'finished', ready: true }));
  await writeFile(join(dir, 'a-b.ready'), '{}');
  const bank = readMediaBank('a-b', dir);
  assert.equal(bank.assets.length, 4);
  assert.deepEqual(bank.assets.map(a => a.id), ['a-b-0', 'a-b-1', 'a-b-2', 'a-b-3']);
  assert.equal(bank.clips.length, 2);
  assert.deepEqual(bank.failures, ['clip 1: HTTP 503']);
  assert.deepEqual(mediaBankIds(dir), ['a-b']);
});

test('readMediaBank devuelve null sin manifiesto válido', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'media-bank-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'x.progress.json'), '{}');
  assert.equal(readMediaBank('x', dir), null);
  assert.equal(readMediaBank('../escape', dir), null);
  assert.deepEqual(mediaBankIds(dir), []);
});

test('--match poda en Fly la media del partido terminado y conserva lo vivo y lo pedido', async t => {
  const root = await mkdtemp(join(tmpdir(), 'media-prune-')); t.after(() => rm(root, { recursive: true, force: true }));
  const data = join(root, 'public/data');
  const out = join(root, 'bank');
  const kickoff = new Date(Date.now() + 3600_000).toISOString();
  const past = new Date(Date.now() - 3600_000).toISOString();
  await mkdir(join(data, 'youtube-scripts'), { recursive: true });
  await writeFile(join(data, 'fixtures.json'), JSON.stringify({ matches: [
    { id: 'a-b', webId: 'a-b', home: 'Alpha', away: 'Beta', status: 'NS', kickoff },
    { id: 'c-d', webId: 'c-d', home: 'Gamma', away: 'Delta', status: 'FT', kickoff: past },
  ] }));
  await writeFile(join(data, 'top.json'), JSON.stringify({ version: 1, ranking: [{ id: 'a-b' }], extra: [] }));
  await writeFile(join(data, 'youtube-scripts', 'a-b.json'), '{}');
  for (const cat of ['image-prompts', 'video-prompts']) {
    await mkdir(join(data, cat), { recursive: true });
    await writeFile(join(data, cat, 'a-b.json'), JSON.stringify({ version: 1, category: cat, matchId: 'a-b', home: 'Alpha', away: 'Beta', prompts: [] }));
  }
  await mkdir(join(out, 'gen', 'c-d'), { recursive: true });
  await writeFile(join(out, 'c-d.json'), JSON.stringify({ matchId: 'c-d', assets: [], clips: [] }));
  await writeFile(join(out, 'c-d.progress.json'), JSON.stringify({ count: 0, failures: [] }));
  await writeFile(join(out, 'c-d.ready'), '{}');
  await writeFile(join(out, 'gen', 'c-d', '0.jpg'), 'foto vieja');
  await writeFile(join(out, 'gen', 'c-d', 'clip-0.mp4'), 'clip viejo');
  const entry = resolve('fly/gateway/workspace/skills/goatlab/scripts/generate-media-pack.mjs');
  await run(process.execPath, [entry, '--match=a-b'], {
    env: { ...process.env, GOATLAB_REPO: root, MEDIA_PACK_DIR: out, AGNES_API_KEY: '' },
  });
  await assert.rejects(access(join(out, 'c-d.json')));
  await assert.rejects(access(join(out, 'c-d.progress.json')));
  await assert.rejects(access(join(out, 'gen', 'c-d')));
  assert.ok(JSON.parse(await readFile(join(out, 'a-b.json'), 'utf8')));
});
