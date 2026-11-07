import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { voicePolicy, VOICE_SECONDS } from '../contract/short-format.js';
const run = promisify(execFile);

const VOICE_VERSION = 2;
const TRIM_NOISE_DB = -35;
const TRIM_MIN_SILENCE = 0.08;
const TRIM_LEAD_MAX = 0.2;
const TRIM_PREROLL = 0.05;

/** Seconds of dead air before the first word; keeps a short pre-roll so the attack survives. */
export async function leadingSilence(file) {
  const { stderr } = await run('ffmpeg', [
    '-hide_banner', '-nostats', '-i', file,
    '-af', `silencedetect=noise=${TRIM_NOISE_DB}dB:d=${TRIM_MIN_SILENCE}`,
    '-f', 'null', '-',
  ], { timeout: 60000 });
  let leading = false;
  for (const row of stderr.split('\n')) {
    const start = row.match(/silence_start:\s*([\d.]+)/);
    if (start) { leading = Number(start[1]) <= TRIM_LEAD_MAX; continue; }
    if (!leading) continue;
    const end = row.match(/silence_end:\s*([\d.]+)/);
    if (end) return Math.max(0, Number(end[1]) - TRIM_PREROLL);
  }
  return 0;
}

export async function adjustVoice({ tmp, voiceFile, voiceSeconds }) {
  const fingerprint = createHash('sha256').update(readFileSync(voiceFile)).digest('hex');
  const meta = join(tmp, 'voice-policy.json'), output = join(tmp, 'voice-adjusted.wav');
  let prior;
  try { prior = JSON.parse(readFileSync(meta, 'utf8')); } catch {}
  if (prior?.version === VOICE_VERSION && prior.fingerprint === fingerprint && existsSync(output)) return { ...prior, file: output, changed: false };
  const trim = await leadingSilence(voiceFile);
  const policy = voicePolicy(voiceSeconds - trim);
  // The trim runs on the decoded stream: transcription, word timings and the mix
  // all read this exact output, so the first word lands on the voice timeline's 0.
  const encode = rate => run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voiceFile, '-vn', '-af',
    `atrim=start=${trim},asetpts=PTS-STARTPTS,atempo=${rate}`,
    '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', `${output}.tmp.wav`], { timeout: 60000 });
  const duration = async () => Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${output}.tmp.wav`])).stdout.trim());
  await encode(policy.rate);
  let actual = await duration();
  // A codec may leave a few milliseconds of padding; retry with a slightly faster
  // rate when that is possible, rather than clipping the end of the recording.
  if (actual > VOICE_SECONDS + .0001) {
    const rate = policy.rate * actual / (VOICE_SECONDS - .01);
    if (rate > 1.1) throw Object.assign(new Error('El audio ajustado no cabe sin superar la aceleración máxima del 10%. Graba hasta 50 segundos y sustituye este audio.'), { code: 'VOICE_TOO_LONG' });
    await encode(rate);
    actual = await duration();
    policy.rate = rate;
  }
  policy.seconds = actual;
  if (!Number.isFinite(policy.seconds) || policy.seconds > VOICE_SECONDS + .0001) throw Object.assign(new Error('El audio ajustado supera el tiempo disponible. Sustituye este audio por una grabación de hasta 50 segundos.'), { code: 'VOICE_TOO_LONG' });
  const final = voicePolicy(policy.seconds);
  renameSync(`${output}.tmp.wav`, output);
  const result = { version: VOICE_VERSION, fingerprint, originalSeconds: voiceSeconds,
    trimSeconds: Number(trim.toFixed(3)), seconds: policy.seconds, rate: policy.rate, frames: final.frames };
  writeFileSync(`${meta}.tmp`, JSON.stringify(result)); renameSync(`${meta}.tmp`, meta);
  return { ...result, file: output, changed: true };
}
