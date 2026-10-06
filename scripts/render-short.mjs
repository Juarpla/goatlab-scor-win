// Render local: media-pack + voz -> MP4 1080x1920 vía Remotion.
// Uso: node --env-file=.env scripts/render-short.mjs --match=<webId> --audio=voz.ogg [--variant=N] [--out=salida.mp4]
// Mismo camino que el worker: tiempos por palabra (Mistral, whisper.cpp),
// fotos reducidas, plantilla fija y voz mezclada. Requiere Node 22, ffmpeg,
// ffprobe y `npm install` en fly/render (Remotion + React).
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, rmSync, cpSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { FRAME_W, FRAME_H, FPS } from '../src/lib/short-format.js';
import { prepareShort, renderSilent, muxVoice, mediaDuration } from '../fly/render/short-job.mjs';

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
const audio = args.audio ?? fail('falta --audio=<voz> (los tiempos de cada palabra salen de la voz)');
if (!existsSync(audio)) fail(`audio no existe: ${audio}`);
const variant = Number(args.variant ?? 0);

if (!(await has('ffmpeg'))) fail('ffmpeg no está en PATH');
if (!(await has('ffprobe'))) fail('ffprobe no está en PATH');

const load = (p) => {
  if (!existsSync(p)) fail(`falta ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
};
const media = load(join(ROOT, 'public/data/media-pack', `${match}.json`));
const assets = Array.isArray(media.assets) ? media.assets : [];
if (assets.some(asset => asset.source !== 'agnes')) fail('Solo se admiten recursos Agnes');

const out = args.out ?? join(ROOT, 'public/shorts', `${match}-v${variant}.mp4`);
mkdirSync(dirname(out), { recursive: true });

const tmp = join(tmpdir(), `goatlab-short-${match}-v${variant}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const voiceFile = join(tmp, `voice-in${audio.match(/\.[^.]+$/)?.[0] ?? '.ogg'}`);
cpSync(audio, voiceFile);

const started = Date.now();
const lap = (label) => console.log(`render: ${label} ${((Date.now() - started) / 1000).toFixed(1)}s`);
try {
  const voiceSeconds = await mediaDuration(voiceFile);
  const { total, provider, errors, voiceFile: adjustedVoiceFile } = await prepareShort({
    tmp,
    voiceFile,
    voiceSeconds,
    assets, clips: media.clips ?? [], facts: media.facts ?? [], motionPrompts: media.motionPrompts ?? [],
    variant,
    home: media.home ?? '',
    away: media.away ?? '',
    matchLabel: media.match,
    log: (m) => console.log(`render: ${m}`),
  });
  lap(`preparado (tiempos ${provider}${errors.length ? `; ${errors.join(' | ')}` : ''})`);
  const silent = join(tmp, 'silent.mp4');
  await renderSilent(tmp, silent);
  lap('remotion');
  const finalOut = join(tmp, 'with-audio.mp4');
  await muxVoice({ silent, voiceFile: adjustedVoiceFile, total, out: finalOut });
  cpSync(finalOut, out);
  if (args.keep) cpSync(join(tmp, 'composition.json'), out.replace(/\.mp4$/, '.json'));
} catch (e) {
  fail(e.message);
}

const probe = JSON.parse(
  (await run('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', out])).stdout,
);
const v = probe.streams.find((s) => s.codec_type === 'video');
if (!v || v.width !== FRAME_W || v.height !== FRAME_H) fail(`video inesperado: ${v?.width}x${v?.height}`);
const [num, den] = v.r_frame_rate.split('/').map(Number);
if (v.codec_name !== 'h264' || Math.abs(num / den - FPS) > .01 || !probe.streams.some(s => s.codec_type === 'audio' && s.codec_name === 'aac') || Number(probe.format.duration) >= 50 || statSync(out).size >= 45_000_000) fail('MP4 fuera del contrato de formato, duración o tamaño');
rmSync(tmp, { recursive: true, force: true });
lap(`listo ${out} (${v.width}x${v.height}, variante ${variant})`);
