import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { compositionFiles, copyRenderInput } from './render-input.mjs';

const CATEGORIES = ['photos', 'clips', 'graphics'];
export const EVALUATION_TTL_MS = 24 * 60 * 60 * 1000;
export const EVALUATION_MAX_BYTES = 384_000_000;

// A candidate classification from source, to be confirmed by watching the full MP4.
export function evaluationCategory(plan) {
  const code = plan?.code || '';
  if (/\bclips\s*(?:\[|\.|\?\.)|<\s*(?:OffthreadVideo|Html5Video|Video)\b/.test(code)) return 'clips';
  if (/\bphotos\s*(?:\[|\.|\?\.)|<\s*(?:KenBurns|Img)\b/.test(code)) return 'photos';
  return 'graphics';
}

export function pruneEvaluationCorpus(root, { now = Date.now() } = {}) {
  const kept = [];
  for (const category of CATEGORIES) {
    const path = join(root, category);
    if (!existsSync(path)) continue;
    try {
      const manifest = JSON.parse(readFileSync(join(path, 'evaluation.json'), 'utf8'));
      if (!(manifest.expiresAt > now)) throw new Error('caducado');
      kept.push(manifest);
    } catch { rmSync(path, { recursive: true, force: true }); }
  }
  for (const category of CATEGORIES) {
    const path = join(root, category + '.tmp');
    if (existsSync(path) && statSync(path).mtimeMs + EVALUATION_TTL_MS <= now) rmSync(path, { recursive: true, force: true });
  }
  return kept;
}

/** Three bounded local snapshots; failure never prevents a verified video delivery. */
export async function retainEvaluation(root, source, job, { now = Date.now(), maxBytes = EVALUATION_MAX_BYTES } = {}) {
  const existing = pruneEvaluationCorpus(root, { now });
  const category = evaluationCategory(job.plan);
  const previous = existing.find(item => item.category === category);
  const seconds = job.originalVoiceSeconds;
  const shortAudio = seconds >= 15 && seconds <= 25;
  if (previous && (!shortAudio || existing.some(item => item.shortAudio))) return null;
  const props = JSON.parse(readFileSync(join(source, 'composition.json'), 'utf8'));
  const prepared = JSON.parse(readFileSync(join(source, 'prepared.json'), 'utf8'));
  const video = `candidate-${job.revision}.mp4`;
  const files = [...compositionFiles(props), 'composition.json', 'prepared.json', video];
  if (existsSync(join(source, 'transcript.json'))) files.push('transcript.json');
  if (prepared.voiceFile) files.push(basename(prepared.voiceFile));
  const bytes = [...new Set(files)].reduce((total, name) => total + statSync(join(source, name)).size, 0);
  if (bytes + existing.filter(item => item.category !== category).reduce((total, item) => total + item.bytes, 0) > maxBytes) return null;
  const manifest = { category, categoryInferred: true, requestId: job.requestId, visualStyle: job.visualStyle, capturedAt: now,
    expiresAt: now + EVALUATION_TTL_MS, shortAudio, originalVoiceSeconds: seconds, bytes,
    metrics: job.metrics, stages: job.stages, video: 'candidate.mp4' };
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const staging = join(root, category + '.tmp'), target = join(root, category);
  rmSync(staging, { recursive: true, force: true });
  try {
    await copyRenderInput(source, staging);
    copyFileSync(join(source, video), join(staging, 'candidate.mp4'));
    if (prepared.voiceFile) {
      const name = 'voice' + extname(prepared.voiceFile);
      copyFileSync(join(source, basename(prepared.voiceFile)), join(staging, name));
      prepared.voiceFile = name;
    }
    for (const name of ['transcript.json']) if (existsSync(join(source, name))) copyFileSync(join(source, name), join(staging, name));
    writeFileSync(join(staging, 'prepared.json'), JSON.stringify(prepared));
    writeFileSync(join(staging, 'evaluation.json'), JSON.stringify(manifest));
    rmSync(target, { recursive: true, force: true });
    renameSync(staging, target);
    return manifest;
  } finally { rmSync(staging, { recursive: true, force: true }); }
}
