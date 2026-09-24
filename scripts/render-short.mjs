// Render de GoatLabShort v1: youtube-scripts + media-pack -> MP4 1080x1920.
// Uso: node scripts/render-short.mjs --match=<webId> [--variant=N] [--audio=f.mp3] [--out=salida.mp3]
// Requiere ffmpeg + ffprobe en PATH (sin drawtext: el texto va como PNG vía resvg).
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  buildShortPlan,
  buildFilterGraph,
  logoPng,
  textPng,
  ACCENT,
} from '../src/lib/short.js';

const run = promisify(execFile);
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }),
);

const fail = (msg) => {
  console.error(`render: ${msg}`);
  process.exit(1);
};

async function has(bin) {
  try {
    await run(process.platform === 'win32' ? 'where' : 'which', [bin]);
    return true;
  } catch {
    return false;
  }
}

const match = args.match ?? fail('falta --match=<webId>');
const variant = Number(args.variant ?? 0);

if (!(await has('ffmpeg'))) fail('ffmpeg no está en PATH');
if (!(await has('ffprobe'))) fail('ffprobe no está en PATH');

const load = (p) => {
  if (!existsSync(p)) fail(`falta ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
};
const script = load(join(ROOT, 'public/data/youtube-scripts', `${match}.json`));
const media = load(join(ROOT, 'public/data/media-pack', `${match}.json`));
const plan = buildShortPlan({ script, media, variant });

const out =
  args.out ?? join(ROOT, 'public/shorts', `${match}-v${plan.variant}.mp4`);
mkdirSync(dirname(out), { recursive: true });

// Descarga las 3 fotos a temporal (se borra al final).
const tmp = join(tmpdir(), `goatlab-short-${match}-v${plan.variant}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const imgs = [];
for (const [i, s] of plan.segments.entries()) {
  const f = join(tmp, `${i}.jpg`);
  const r = await fetch(s.asset.url);
  if (!r.ok) fail(`foto ${i} (${s.asset.source}:${s.asset.id}): HTTP ${r.status}`);
  writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  imgs.push(f);
}

const brandIdx = plan.segments.length;
const overlays = [
  logoPng(),
  textPng({ text: plan.brand, fontSize: 64, color: ACCENT }),
  textPng({ text: plan.brand, fontSize: 110, color: ACCENT }),
  textPng({ text: plan.match, fontSize: 44, color: '#ffffff' }),
];
const graph = buildFilterGraph(plan, {
  logo: brandIdx,
  bottom: brandIdx + 1,
  endMain: brandIdx + 2,
  endSub: brandIdx + 3,
});
const looped = (f, t) => ['-loop', '1', '-framerate', String(plan.fps), '-t', String(t), '-i', f];
const ff = [
  '-y',
  ...imgs.flatMap((f) => looped(f, plan.segments[0].seconds)),
  ...overlays.flatMap((f) => looped(f, plan.totalSeconds)),
];
if (args.audio) {
  if (!existsSync(args.audio)) fail(`audio no existe: ${args.audio}`);
  ff.push('-i', args.audio);
}
const audioIdx = args.audio ? brandIdx + overlays.length : -1;
ff.push(
  '-filter_complex', graph,
  '-map', '[vout]',
  ...(args.audio ? ['-map', `${audioIdx}:a`, '-c:a', 'aac', '-shortest'] : ['-an']),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  ...(args.audio ? [] : ['-frames:v', String(plan.totalSeconds * plan.fps)]),
  out,
);

try {
  await run('ffmpeg', ff, { timeout: 10 * 60 * 1000 });
} catch (e) {
  fail(`ffmpeg falló:\n${(e.stderr ?? e.message).split('\n').slice(-40).join('\n')}`);
}

// Verificación: 1080x1920 y duración ≈ plan.
const probe = JSON.parse(
  (await run('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', out])).stdout,
);
const v = probe.streams.find((s) => s.codec_type === 'video');
if (!v || v.width !== plan.width || v.height !== plan.height)
  fail(`video inesperado: ${v?.width}x${v?.height}`);
const dur = Number(
  (await run('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', out])).stdout,
);
if (Math.abs(dur - plan.totalSeconds) > 1.5) fail(`duración ${dur}s ≠ ${plan.totalSeconds}s`);

rmSync(tmp, { recursive: true, force: true });
console.log(`render: ${out} (${v.width}x${v.height}, ${dur.toFixed(1)}s, variante ${plan.variant})`);
