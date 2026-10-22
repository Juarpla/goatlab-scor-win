// Benchmark a saved composition, or a synthetic 10s authored short, on the production Remotion path.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { cpus, totalmem, tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { copyRenderInput, benchmarkSchedule } from '../fly/render/render-input.mjs';
import { photoProfile } from '../fly/render/photo-normalization.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { renderSilent } from '../fly/render/short-job.mjs';

const run = promisify(execFile);
const repo = fileURLToPath(new URL('..', import.meta.url));
const flag = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const list = (name, fallback) => (flag(name) || fallback).split(',').filter(Boolean);
const input = flag('input');
const runs = Number(flag('runs') || 3);
if (!Number.isInteger(runs) || runs < 1 || runs > 5) throw new Error('runs debe estar entre 1 y 5 (repeticiones calientes más una fría)');

async function fixtureDir(photoMax) {
  const tmp = mkdtempSync(join(tmpdir(), 'goatlab-bench-'));
  const height = photoProfile(photoMax).maxHeight;
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
if (input && process.argv.includes('--fixture')) throw new Error('elige --input o --fixture');
const photos = list('photo-max', '1472,1280,1080').map(Number);
photos.forEach(photoProfile);
const workers = list('workers', '2').map(Number);
if (workers.some(n => !Number.isInteger(n) || n < 1)) throw new Error('workers debe ser un entero positivo');
const gls = list('gl', 'default');
const configurations = photos.flatMap(photoMax => workers.flatMap(workers => gls.map(gl => ({ photoMax, workers, gl }))));
const root = mkdtempSync(join(tmpdir(), 'goatlab-bench-run-'));
const directories = new Map(), results = [];
let fixture;
try {
  if (!input) {
    fixture = await fixtureDir(1472);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(fixture.tmp, 'composition.json'), JSON.stringify(fixture.props));
  }
  const source = input ? resolve(input) : fixture.tmp;
  const output = flag('output-dir') ? resolve(flag('output-dir')) : null;
  if (output === source || output?.startsWith(source + sep)) throw new Error('output-dir debe estar fuera de la composición original');
  if (output) mkdirSync(output, { recursive: true });
  for (const config of configurations) {
    const key = `${config.photoMax}-${config.workers}-${config.gl}`;
    const dir = join(root, key);
    const props = await copyRenderInput(source, dir, { photoMax: config.photoMax });
    directories.set(key, { dir, photoSizes: props.photos.map(({ width, height }) => ({ width, height })) });
  }
  for (const config of benchmarkSchedule(configurations, runs)) {
    const key = `${config.photoMax}-${config.workers}-${config.gl}`;
    const { dir, photoSizes } = directories.get(key);
    if (config.gl === 'default') delete process.env.REMOTION_GL;
    else process.env.REMOTION_GL = config.gl;
    const out = join(dir, 'benchmark.mp4');
    const at = Date.now();
    const metrics = await renderSilent(dir, out, { workers: config.workers });
    const video = output && config.run === 1 ? join(output, `${key}.mp4`) : undefined;
    if (video) copyFileSync(out, video);
    const row = { type: 'run', ...config, requestedWorkers: config.workers, video, fixture: !input, photoSizes, seconds: (Date.now() - at) / 1000, ...metrics };
    results.push(row);
    console.log(JSON.stringify(row));
    rmSync(out, { force: true });
  }
  const median = values => { const sorted = [...values].sort((a, b) => a - b); const i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; };
  for (const config of configurations) {
    const warm = results.filter(r => r.phase === 'warm-bundle' && r.photoMax === config.photoMax && r.requestedWorkers === config.workers && r.gl === config.gl);
    const baseline = results.filter(r => r.phase === 'warm-bundle' && r.photoMax === 1472 && r.requestedWorkers === config.workers && r.gl === config.gl);
    const captureMs = median(warm.map(r => r.captureMs));
    const speedup = baseline.length ? 1 - captureMs / median(baseline.map(r => r.captureMs)) : null;
    console.log(JSON.stringify({ type: 'summary', ...config, samples: warm.length, captureMs, improvement: speedup, performanceCandidate: speedup !== null && speedup >= .15, visualReviewRequired: true, fixture: !input }));
  }
} finally {
  rmSync(root, { recursive: true, force: true });
  if (fixture) rmSync(fixture.tmp, { recursive: true, force: true });
}
