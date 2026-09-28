// Prepara la carpeta de un Short para HyperFrames: voz normalizada, tiempos
// por palabra, fotos reducidas y index.html. Lo usan el worker y el render local.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildComposition, alignWords, ENDCARD_SECONDS } from '../../src/lib/hyperframe.js';
import { alignToScript, shiftWords } from '../../src/lib/timing.js';
import { transcribeWords } from './transcribe.mjs';

const run = promisify(execFile);
export const LEAD_SECONDS = 0.5; // la voz entra a los 0.5s
export const PHOTO_MAX_W = 1440;
export const BED_VOLUME_DB = -18;
const BED_FADE_IN = 0.5;
const BED_FADE_OUT = 1;
const HERE = fileURLToPath(new URL('.', import.meta.url));
const APP_ROOT = join(HERE, '../..');

export function hyperframesCwd() {
  return existsSync(join(HERE, 'node_modules/hyperframes')) ? HERE : APP_ROOT;
}

function gsapSource() {
  for (const p of [join(HERE, 'node_modules/gsap/dist/gsap.min.js'), join(APP_ROOT, 'node_modules/gsap/dist/gsap.min.js')]) {
    if (existsSync(p)) return p;
  }
  throw new Error('falta gsap.min.js (npm install en fly/render)');
}

export async function mediaDuration(file) {
  const { stdout } = await run('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim());
}

async function imageWidth(file) {
  const { stdout } = await run('ffprobe', ['-v', 'quiet', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0', file]);
  return Number(stdout.trim());
}

/** Descarga una foto y la reduce a PHOTO_MAX_W si viene más ancha. */
async function fetchPhoto(url, raw, out) {
  const r = await fetch(url, { headers: { 'user-agent': 'goatlab-render/1.0 (https://goatlab.win)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
  const width = await imageWidth(raw);
  if (!(width > PHOTO_MAX_W)) {
    writeFileSync(out, readFileSync(raw));
    return;
  }
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', `scale=${PHOTO_MAX_W}:-2:flags=lanczos`, '-q:v', '2', out]);
}

async function voiceTimes({ tmp, voiceFile, voiceSeconds, narration, log }) {
  const flac = join(tmp, 'voice16k.flac');
  const wav = join(tmp, 'voice16k.wav');
  await Promise.all([
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voiceFile, '-ac', '1', '-ar', '16000', flac]),
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voiceFile, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]),
  ]);
  const { provider, words, errors } = await transcribeWords({ flac, wav, voiceSeconds, log });
  const aligned = provider ? alignToScript(narration, words, voiceSeconds) : [];
  if (aligned.length) return { provider, words: aligned, heard: words, errors };
  log('tiempos: sin proveedor, reparto por largo de palabra');
  return { provider: 'reparto', words: alignWords(narration, voiceSeconds), heard: [], errors };
}

/**
 * Deja `tmp/index.html` listo para `hyperframes render tmp`.
 * Devuelve la duración total y el proveedor que dio los tiempos.
 */
export async function prepareShort({
  tmp,
  voiceFile,
  voiceSeconds,
  narration,
  photos,
  subjects = [],
  camera,
  matchLabel,
  log = () => {},
}) {
  const total = voiceSeconds + LEAD_SECONDS * 2 + ENDCARD_SECONDS;
  const [timing, frames] = await Promise.all([
    voiceTimes({ tmp, voiceFile, voiceSeconds, narration, log }),
    Promise.all(photos.map(async (url, i) => {
      const src = `${i}.jpg`;
      try {
        await fetchPhoto(url, join(tmp, `raw-${i}`), join(tmp, src));
        return { src, subject: subjects[i] ?? null };
      } catch (e) {
        log(`foto ${i}: ${e.message}`);
        return null;
      }
    })),
  ]);
  const ready = frames.filter(Boolean);
  if (ready.length < 2) throw new Error(`solo ${ready.length} fotos descargadas`);
  writeFileSync(join(tmp, 'gsap.min.js'), readFileSync(gsapSource()));
  writeFileSync(join(tmp, 'index.html'), buildComposition({
    duration: total,
    photos: ready,
    camera,
    words: shiftWords(timing.words, LEAD_SECONDS),
    match: matchLabel,
  }));
  return { total, provider: timing.provider, errors: timing.errors, heard: timing.heard };
}

export function hyperframesArgs(tmp, out, { workers } = {}) {
  const args = [
    '--no-install', 'hyperframes', 'render', tmp, '-o', out, '--quiet',
    '--fps', '30', '--quality', 'standard',
  ];
  if (workers) args.push('--workers', String(workers));
  return args;
}

export async function renderSilent(tmp, out, { workers = process.env.RENDER_WORKERS } = {}) {
  const args = hyperframesArgs(tmp, out, { workers });
  try {
    await run('npx', args, { timeout: 20 * 60 * 1000, cwd: hyperframesCwd(), env: process.env, maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    throw new Error(`hyperframes: ${(e.stderr || e.stdout || e.message).split('\n').slice(-20).join('\n')}`);
  }
}

export function bedPath() {
  return join(HERE, 'assets/bed.mp3');
}

/** Voz a −16 LUFS y cama a −18 dB, sin bajar la voz al mezclar. */
export function voiceBedGraph(total) {
  const lead = LEAD_SECONDS * 1000;
  const dur = Number(total);
  const fadeOut = Math.max(0, dur - BED_FADE_OUT);
  return (
    `[1:a]aresample=44100,aformat=channel_layouts=stereo,` +
    `adelay=${lead}|${lead},` +
    `loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=0:${dur}[voice];` +
    `[2:a]aresample=44100,aformat=channel_layouts=stereo,` +
    `atrim=0:${dur},afade=t=in:st=0:d=${BED_FADE_IN},` +
    `afade=t=out:st=${fadeOut}:d=${BED_FADE_OUT},` +
    `volume=${BED_VOLUME_DB}dB[bed];` +
    `[voice][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`
  );
}

/** Voz con 0.5 s de entrada y música de fondo; el video se copia. */
export async function muxVoice({ silent, voiceFile, total, out, bedFile = bedPath() }) {
  if (!existsSync(bedFile)) throw new Error(`falta la música de fondo: ${bedFile}`);
  try {
    await run('ffmpeg', [
      '-y', '-i', silent, '-i', voiceFile,
      '-stream_loop', '-1', '-i', bedFile,
      '-filter_complex', voiceBedGraph(total),
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart',
      out,
    ], { timeout: 5 * 60 * 1000 });
  } catch (e) {
    throw new Error(`ffmpeg: ${(e.stderr ?? e.message).split('\n').slice(-15).join('\n')}`);
  }
}
