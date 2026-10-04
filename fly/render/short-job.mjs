// Prepara la carpeta de un Short para HyperFrames: voz normalizada, tiempos
// por palabra, fotos reducidas y index.html. Lo usan el worker y el render local.
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ENDCARD_SECONDS, FONT_FILE } from '../../src/lib/hyperframe.js';
import { buildPlannedComposition } from '../../src/lib/edit-plan.js';
import { warmPhotos, pinPhotos } from './photo-cache.mjs';
import { cuesFromHeard, shiftWords } from '../../src/lib/timing.js';
import { transcribeWords } from './transcribe.mjs';

const run = promisify(execFile);
export const LEAD_SECONDS = 0.5; // la voz entra a los 0.5s
export const PHOTO_MAX_W = 1472;
export const BED_VOLUME_DB = -18;
const BED_FADE_IN = 0.5;
const BED_FADE_OUT = 1;
const HERE = fileURLToPath(new URL('.', import.meta.url));
const APP_ROOT = join(HERE, '../..');
export const SKILL_ROOT = process.env.GOATLAB_SKILL_DIR || join(APP_ROOT, 'fly/gateway/workspace/skills/goatlab');
function writeJson(path, value) {
  writeFileSync(`${path}.tmp`, JSON.stringify(value));
  renameSync(`${path}.tmp`, path);
}

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

async function voiceTimes({ tmp, voiceFile, voiceSeconds, log }) {
  const flac = join(tmp, 'voice16k.flac');
  const wav = join(tmp, 'voice16k.wav');
  await Promise.all([
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voiceFile, '-ac', '1', '-ar', '16000', flac]),
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voiceFile, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]),
  ]);
  const { provider, words, errors } = await transcribeWords({ flac, wav, voiceSeconds, log });
  const cues = cuesFromHeard(words);
  if (!cues.length) throw new Error('No se pudo transcribir el audio; se conservará para reintentar.');
  if (cues.some(w => w.end > voiceSeconds + .3)) throw new Error('transcripción fuera de la duración de la voz');
  return { provider: provider || 'ninguno', words: cues, heard: words, errors };
}

/**
 * Deja `tmp/index.html` listo para `hyperframes render tmp`.
 * Devuelve la duración total y el proveedor que dio los tiempos.
 */
export async function prepareShort({ tmp, voiceFile, voiceSeconds, assets = [], variant = 0,
  home = '', away = '', matchLabel, log = () => {},
  cacheDir = process.env.PHOTO_CACHE_DIR || join(APP_ROOT, '.cache/shorts/photos'),
  planner = planEdit, transcriber = voiceTimes,
  facts = [], mediaMinimum = 0, requestId, onStage = async () => {},
}) {
  const stages = {}, measure = async (label, fn) => {
    const at = Date.now();
    await onStage(label);
    try { return await fn(); } finally { stages[label] = Date.now() - at; await onStage(label, stages[label]); }
  };
  const total = voiceSeconds + LEAD_SECONDS * 2 + ENDCARD_SECONDS;
  let timing;
  const transcriptFile = join(tmp, 'transcript.json');
  if (existsSync(transcriptFile)) {
    try { timing = JSON.parse(readFileSync(transcriptFile)); } catch { /* interrupted legacy write */ }
  }
  if (!timing) {
    timing = await measure('transcription', () => transcriber({ tmp, voiceFile, voiceSeconds, log }));
    if (!timing.words?.length) throw new Error('se requiere transcripción para renderizar');
    writeJson(transcriptFile, timing);
  }
  if (!timing.words?.length || timing.words.some(w => !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.end <= w.start || w.start < 0 || w.end > voiceSeconds + .3))
    throw new Error('transcripción vacía o fuera de la duración de la voz');
  const photos = [];
  const available = [];
  const unpin = pinPhotos(assets);
  try {
  const warmed = await measure('photos', () => warmPhotos(assets, cacheDir, log));
  warmed.forEach((photo, i) => {
    if (!photo) return;
    const src = `${photos.length}.jpg`;
    copyFileSync(photo.path, join(tmp, src));
    const backdrop = `${photos.length}-back.jpg`;
    copyFileSync(photo.backdrop, join(tmp, backdrop));
    const focusBlur = `${photos.length}-focus.jpg`;
    copyFileSync(photo.focusBlur, join(tmp, focusBlur));
    photos.push({ src, backdrop, focusBlur, width: photo.width, height: photo.height, subject: assets[i].subject ?? null });
    available.push({ ...assets[i], width: photo.width, height: photo.height });
  });
  } finally { unpin(); }
  if (photos.length < assets.length) log(`media: ${photos.length}/${assets.length} fotos disponibles; se completará con gráficos`);
  const words = shiftWords(timing.words, LEAD_SECONDS);
  const source = { planVersion: 2, requestId, facts, span: total - ENDCARD_SECONDS, words, variant, home, away, match: matchLabel,
    assets: available.map((asset, index) => ({ index, subject: asset.subject, motive: asset.motive,
      title: asset.title, description: asset.description, query: asset.query,
      selection: asset.selection, generated: asset.source === 'agnes', width: asset.width, height: asset.height })) };
  const plan = await measure('planning', () => planner(source, tmp, log));
  if (plan.fallback) await onStage('planningFallback');
  copyFileSync(join(HERE, 'assets', FONT_FILE), join(tmp, FONT_FILE));
  copyFileSync(join(SKILL_ROOT, 'assets/brand.svg'), join(tmp, 'brand.svg'));
  copyFileSync(gsapSource(), join(tmp, 'gsap.min.js'));
  writeFileSync(join(tmp, 'index.html'), buildPlannedComposition({ duration: total, photos, words, plan, facts, match: matchLabel }));
  writeJson(join(tmp, 'stages.json'), stages);
  return { total, provider: timing.provider, errors: timing.errors, heard: timing.heard, plan, stages };
}

export async function planEdit(source, tmp, log = () => {}) {
  const input = join(tmp, 'edit-input.json'), output = join(tmp, 'edit-plan.json');
  const serialized = JSON.stringify(source);
  if (existsSync(input) && existsSync(output) && readFileSync(input, 'utf8') === serialized)
    return JSON.parse(readFileSync(output, 'utf8'));
  // Invalidate the old plan before changing its input, including failed retries.
  rmSync(output, { force: true });
  writeJson(input, source);
  try {
    const result = await run(process.env.PYTHON_BIN || 'python3', [join(SKILL_ROOT, 'scripts/planner.py'), '--input', input, '--out', output],
      { timeout: 250_000, maxBuffer: 1024 * 1024, env: process.env });
    result.stderr.split('\n').filter(line=>line.startsWith('planner: ')).forEach(log);
  } catch (error) {
    const lines=String(error.stderr || 'planificador no disponible').split('\n');
    lines.filter(line=>line.startsWith('planner: ')).forEach(log);
    throw new Error(`montaje: ${lines.filter(line=>!line.startsWith('planner: ')).join('\n').trim().slice(0, 400)}`);
  }
  return JSON.parse(readFileSync(output, 'utf8'));
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
