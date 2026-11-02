// Stage 07: voice, transcription, media caches and the immutable prepared input.
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DIRECTOR_ENDCARD_SECONDS, FPS, LEAD_SECONDS } from '../contract/short-format.js';
import { cuesFromHeard, shiftWords } from '../contract/timing.js';
import { getRenderer } from '../render/index.mjs';
import { writeJson } from './00-io.mjs';
import { adjustVoice } from './01-voice.mjs';
import { transcribeWords } from './02-transcribe.mjs';
import { PHOTO_PROFILE } from './04-photo-normalize.mjs';
import { pinPhotos, warmPhotos } from './05-photo-cache.mjs';
import { pinClips, warmClips } from './06-clip-cache.mjs';
import { composeShort } from './08-author.mjs';

const run = promisify(execFile);
export { LEAD_SECONDS };
export { PHOTO_PROFILE };
export const PHOTO_MAX_W = PHOTO_PROFILE.maxWidth;
const HERE = fileURLToPath(new URL('.', import.meta.url));
const APP_ROOT = join(HERE, '../..');

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
 * Returns total duration and the provider that supplied the timings.
 */
export async function prepareShort({ tmp, voiceFile, voiceSeconds, assets = [], variant = 0,
  home = '', away = '', matchLabel, log = () => {},
  cacheDir = process.env.PHOTO_CACHE_DIR || join(APP_ROOT, '.cache/shorts/photos'),
  plan, transcriber = voiceTimes,
  facts = [], clips = [], mediaMinimum = 0, requestId, onStage = async () => {},
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
  const photos = [], previews = [], available = [];
  const unpin = pinPhotos(assets);
  try {
  const warmed = await measure('photos', () => warmPhotos(assets, cacheDir, log));
  for (let i = 0; i < warmed.length; i++) {
    const photo = warmed[i];
    if (!photo) continue;
    const src = `${photos.length}.jpg`;
    copyFileSync(photo.path, join(tmp, src));
    const backdrop = `${photos.length}-back.jpg`;
    copyFileSync(photo.backdrop, join(tmp, backdrop));
    const focusBlur = `${photos.length}-focus.jpg`;
    copyFileSync(photo.focusBlur, join(tmp, focusBlur));
    const preview = `preview-${src}`;
    try {
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(tmp, src), '-vf', 'scale=576:-2', '-frames:v', '1', '-q:v', '5', join(tmp, preview)], { timeout: 30_000 });
      previews.push(preview);
    } catch { /* authoring falls back to the full photo */ }
    photos.push({ src, backdrop, focusBlur, width: photo.width, height: photo.height, subject: assets[i].subject ?? null, generated: assets[i].source === 'agnes' });
    available.push({ ...assets[i], width: photo.width, height: photo.height });
  }
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
  const source = { brand: { name: 'GoatLab', url: 'goatlab.win' }, planVersion: 5, frames: voice.frames, fps: FPS, endcardSeconds: DIRECTOR_ENDCARD_SECONDS, clips: availableClips, requestId, facts, span: total - DIRECTOR_ENDCARD_SECONDS, words, variant, home, away, match: matchLabel,
    assets: available.map((asset, index) => ({ index, subject: asset.subject, motive: asset.motive,
      title: asset.title, description: asset.description, query: asset.query,
      selection: asset.selection, generated: asset.source === 'agnes', width: asset.width, height: asset.height })) };
  getRenderer().materialize(tmp);
  const prepared = { total, frames: voice.frames, photos, previews, clips: videos, words, facts, match: matchLabel,
    source, voiceFile, voiceRate: voice.rate, originalVoiceSeconds: voice.originalSeconds, provider: timing.provider, errors: timing.errors, heard: timing.heard, stages };
  writeJson(join(tmp, 'prepared.json'), prepared);
  if (plan) composeShort(tmp, plan);
  writeJson(join(tmp, 'stages.json'), stages);
  return { ...prepared, plan };
}
