// Benchmark a saved composition, or a synthetic 10s authored short, on the production Remotion path.
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { cpus, totalmem, tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { renderSilent } from '../fly/render/short-job.mjs';

const run = promisify(execFile);
const repo = fileURLToPath(new URL('..', import.meta.url));
const flag = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const list = (name, fallback) => (flag(name) || fallback).split(',').filter(Boolean);
const input = flag('input');
const runs = Math.min(5, Math.max(1, Number(flag('runs') || (process.argv.includes('--fixture') ? 1 : 3))));

async function fixtureDir(photoMax) {
  const tmp = mkdtempSync(join(tmpdir(), 'goatlab-bench-'));
  const height = photoMax >= 1400 ? 2624 : 1920;
  const photos = [];
  for (let i = 0; i < 4; i++) {
    const src = `${i}.jpg`;
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${photoMax}x${height}:r=1`, '-frames:v', '1', join(tmp, src)], { timeout: 20_000 });
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(tmp, src), '-vf', 'scale=270:480:force_original_aspect_ratio=increase,crop=270:480,gblur=sigma=12', '-frames:v', '1', join(tmp, `${i}-back.jpg`)], { timeout: 20_000 });
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(tmp, src), '-vf', 'scale=iw/8:ih/8,gblur=sigma=8', '-frames:v', '1', join(tmp, `${i}-focus.jpg`)], { timeout: 20_000 });
    photos.push({ src, backdrop: `${i}-back.jpg`, focusBlur: `${i}-focus.jpg`, width: photoMax, height });
  }
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', join(tmp, 'clip-0.mp4')], { timeout: 30_000 });
  copyFileSync(join(repo, 'fly/render/assets/LiberationSans-Bold.ttf'), join(tmp, 'LiberationSans-Bold.ttf'));
  const brand = [join(repo, 'fly/gateway/workspace/skills/goatlab/assets/brand.svg'), join(repo, 'goatlab-skill/assets/brand.svg')].find(existsSync);
  copyFileSync(brand, join(tmp, 'brand.svg'));
  const words = Array.from({ length: 25 }, (_, i) => ({ word: 'gol', start: i * .4, end: i * .4 + .3 }));
  const code = readFileSync(fileURLToPath(new URL('./bench/piece.jsx', import.meta.url)), 'utf8');
  const props = { frames: 330, contentFrames: 300, photos, clips: [{ src: 'clip-0.mp4', width: 1080, height: 1920, duration: 4 }], words,
    facts: [{ id: 'shots', label: 'Tiros', value: 12, unit: '', source: 'bench' }], match: 'Bench', brandName: 'GoatLab', brandUrl: 'goatlab.win',
    font: 'LiberationSans-Bold.ttf', brand: 'brand.svg', plan: { version: 5, code, scenes: [{ start: 0, end: 10 }], music: false } };
  return { tmp, props };
}

if (!input && !process.argv.includes('--fixture')) throw new Error('falta --input=<carpeta> o --fixture');
const photos = list('photo-max', '1472');
const workers = list('workers', '1');
const gls = list('gl', 'default');
for (const photoMax of photos.map(Number)) {
  const fixture = process.argv.includes('--fixture') ? await fixtureDir(photoMax) : null;
  for (const count of workers) {
    for (const gl of gls) {
      if (gl === 'default') delete process.env.REMOTION_GL;
      else process.env.REMOTION_GL = gl;
      for (let i = 0; i < runs; i++) {
        const dir = fixture ? fixture.tmp : input;
        if (fixture) {
          const { writeFileSync } = await import('node:fs');
          writeFileSync(join(dir, 'composition.json'), JSON.stringify(fixture.props));
        }
        const at = Date.now();
        const metrics = await renderSilent(dir, join(dir, `benchmark-${photoMax}-${count}-${gl}-${i}.mp4`), { workers: Number(count) });
        console.log(JSON.stringify({ run: i + 1, engine: 'remotion', photoMax, workers: Number(count), gl, cpus: cpus().length, memMb: Math.round(totalmem() / 1e6), seconds: (Date.now() - at) / 1000, ...metrics }));
      }
    }
  }
  if (fixture) rmSync(fixture.tmp, { recursive: true, force: true });
}
