import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { voicePolicy, VOICE_SECONDS } from '../../src/lib/short-format.js';
const run = promisify(execFile);
export async function adjustVoice({ tmp, voiceFile, voiceSeconds }) {
  const policy = voicePolicy(voiceSeconds);
  const fingerprint = createHash('sha256').update(readFileSync(voiceFile)).digest('hex');
  const meta = join(tmp, 'voice-policy.json'), output = join(tmp, 'voice-adjusted.wav');
  let prior;
  try { prior = JSON.parse(readFileSync(meta, 'utf8')); } catch {}
  if (prior?.version === 1 && prior.fingerprint === fingerprint && existsSync(output)) return { ...prior, file: output, changed: false };
  // atempo retains the pitch. All transcription and mixing use this exact output.
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voiceFile, '-vn', '-af', `atempo=${policy.rate}`, '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', `${output}.tmp.wav`], { timeout: 60000 });
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${output}.tmp.wav`]);
  const actual = Number(stdout.trim());
  // A codec may leave a few milliseconds of padding; retry with a slightly faster
  // rate when that is possible, rather than clipping the end of the recording.
  if (actual > VOICE_SECONDS + .0001) {
    const rate = policy.rate * actual / (VOICE_SECONDS - .01);
    if (rate > 1.1) throw Object.assign(new Error('El audio ajustado no cabe sin superar la aceleración máxima del 10%. Graba hasta 45 segundos y sustituye este audio.'), { code: 'VOICE_TOO_LONG' });
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voiceFile, '-vn', '-af', `atempo=${rate}`, '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', `${output}.tmp.wav`], { timeout: 60000 });
    const result = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${output}.tmp.wav`]);
    policy.rate = rate; policy.seconds = Number(result.stdout.trim());
  } else policy.seconds = actual;
  if (!Number.isFinite(policy.seconds) || policy.seconds > VOICE_SECONDS + .0001) throw Object.assign(new Error('El audio ajustado supera el tiempo disponible. Sustituye este audio por una grabación de hasta 45 segundos.'), { code: 'VOICE_TOO_LONG' });
  const final = voicePolicy(policy.seconds);
  renameSync(`${output}.tmp.wav`, output);
  const result = { version: 1, fingerprint, originalSeconds: voiceSeconds, seconds: policy.seconds, rate: policy.rate, frames: final.frames };
  writeFileSync(`${meta}.tmp`, JSON.stringify(result)); renameSync(`${meta}.tmp`, meta);
  return { ...result, file: output, changed: true };
}
