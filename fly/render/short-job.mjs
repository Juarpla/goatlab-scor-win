// Prepare a bounded, immutable Remotion composition shared by local and Fly jobs.
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DIRECTOR_ENDCARD_SECONDS, FONT_FILE, FPS, LEAD_SECONDS } from '../../src/lib/short-format.js';
import { authoredProps } from './authored-composition.mjs';
import { adjustVoice } from './voice-policy.mjs';
import { renderRemotion } from './remotion-render.mjs';
import { compositionProps } from '../../src/lib/edit-plan.js';
import { warmClips, pinClips } from './clip-cache.mjs';
import { warmPhotos, pinPhotos } from './photo-cache.mjs';
import { cuesFromHeard, shiftWords } from '../../src/lib/timing.js';
import { transcribeWords } from './transcribe.mjs';

const run = promisify(execFile);
export { LEAD_SECONDS };
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
 * Persist the render input after adjusting voice and validating the plan.
 * Devuelve la duración total y el proveedor que dio los tiempos.
 */
export async function prepareShort({ tmp, voiceFile, voiceSeconds, assets = [], variant = 0,
  home = '', away = '', matchLabel, log = () => {},
  cacheDir = process.env.PHOTO_CACHE_DIR || join(APP_ROOT, '.cache/shorts/photos'),
  plan, transcriber = voiceTimes,
  facts = [], clips = [], motionPrompts = [], mediaMinimum = 0, requestId, onStage = async () => {},
}) {
  const stages = {}, measure = async (label, fn) => {
    const at = Date.now();
    await onStage(label);
    try { return await fn(); } finally { stages[label] = Date.now() - at; await onStage(label, stages[label]); }
  };
  // Empty old transcripts must never pass into planning.
  const cachedTranscript = join(tmp, 'transcript.json');
  if (existsSync(cachedTranscript) && !JSON.parse(readFileSync(cachedTranscript)).words?.length) throw new Error('transcripción vacía');
  const voice = await measure('voiceAdjustment', () => adjustVoice({ tmp, voiceFile, voiceSeconds }));
  voiceFile = voice.file; voiceSeconds = voice.seconds;
  if (voice.changed) rmSync(cachedTranscript, { force: true });
  const total = voice.frames / FPS;
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
    photos.push({ src, backdrop, focusBlur, width: photo.width, height: photo.height, subject: assets[i].subject ?? null, generated: assets[i].source === 'agnes' });
    available.push({ ...assets[i], width: photo.width, height: photo.height });
  });
  } finally { unpin(); }
  if (photos.length < assets.length) log(`media: ${photos.length}/${assets.length} fotos disponibles; se completará con gráficos`);
  const videos = [], availableClips = [];
  const unpinClips = pinClips(clips);
  try {
    const warmedClips = await measure('clips', () => warmClips(clips, join(cacheDir, '../clip-cache'), log));
    warmedClips.forEach((clip, index) => {
      if (!clip) return;
      const src = `clip-${videos.length}.mp4`;
      copyFileSync(clip.path, join(tmp, src));
      videos.push({ src, width: clip.width, height: clip.height, duration: clip.duration });
      availableClips.push({ index: videos.length - 1, width: clip.width, height: clip.height, duration: clip.duration, generated: true, title: clips[index].prompt ?? 'Football animation' });
    });
  } finally { unpinClips(); }
  const words = shiftWords(timing.words, LEAD_SECONDS);
  const source = { brand: { name: 'GoatLab', url: 'goatlab.win' }, planVersion: 5, frames: voice.frames, fps: FPS, endcardSeconds: DIRECTOR_ENDCARD_SECONDS, clips: availableClips, motionPrompts, requestId, facts, span: total - DIRECTOR_ENDCARD_SECONDS, words, variant, home, away, match: matchLabel,
    assets: available.map((asset, index) => ({ index, subject: asset.subject, motive: asset.motive,
      title: asset.title, description: asset.description, query: asset.query,
      selection: asset.selection, generated: asset.source === 'agnes', width: asset.width, height: asset.height })) };
  copyFileSync(join(HERE, 'assets', FONT_FILE), join(tmp, FONT_FILE));
  copyFileSync(join(SKILL_ROOT, 'assets/brand.svg'), join(tmp, 'brand.svg'));
  const prepared = { total, frames: voice.frames, photos, clips: videos, words, facts, motionPrompts, match: matchLabel,
    source, voiceFile, voiceRate: voice.rate, originalVoiceSeconds: voice.originalSeconds, provider: timing.provider, errors: timing.errors, heard: timing.heard, stages };
  writeJson(join(tmp, 'prepared.json'), prepared);
  if (plan) composeShort(tmp, plan);
  writeJson(join(tmp, 'stages.json'), stages);
  return { ...prepared, plan };
}

/** Render executes the director's plan; it has no creative model or local fallback. */
export function composeShort(tmp, plan) {
  const prepared = JSON.parse(readFileSync(join(tmp, 'prepared.json'), 'utf8'));
  const props = plan?.version === 5 ? authoredProps(prepared, plan) : compositionProps({ ...prepared, plan });
  writeJson(join(tmp, 'composition.json'), props);
  return props;
}

export async function renderSilent(tmp, out, { workers = process.env.RENDER_WORKERS || 1, onProgress, cancelSignal, isCancelled } = {}) {
  return renderRemotion(tmp, out, { workers, onProgress, cancelSignal, isCancelled });
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
export async function muxVoice({ silent, voiceFile, total, out, bedFile = bedPath(), music = true }) {
  if (!music) {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', voiceFile, '-filter_complex',
      `[1:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${LEAD_SECONDS * 1000}|${LEAD_SECONDS * 1000},loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=0:${Number(total)}[voice]`,
      '-map', '0:v', '-map', '[voice]', '-c:v', 'copy', '-c:a', 'aac', '-t', String(total), '-movflags', '+faststart', out], { timeout: 300_000 });
    return;
  }
  if (!existsSync(bedFile)) throw new Error(`falta la música de fondo: ${bedFile}`);
  try {
    await run('ffmpeg', [
      '-y', '-i', silent, '-i', voiceFile,
      '-stream_loop', '-1', '-i', bedFile,
      '-filter_complex', voiceBedGraph(total),
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-t', String(total), '-movflags', '+faststart',
      out,
    ], { timeout: 5 * 60 * 1000 });
  } catch (e) {
    throw new Error(`ffmpeg: ${(e.stderr ?? e.message).split('\n').slice(-15).join('\n')}`);
  }
}
