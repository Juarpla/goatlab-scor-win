// Stage 10: voice at −16 LUFS and background bed at −18 dB, then mux.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { LEAD_SECONDS } from '../contract/short-format.js';

const run = promisify(execFile);
const HERE = fileURLToPath(new URL('.', import.meta.url));
const SOUNDTRACKS = join(HERE, '../soundtracks');
export const BED_VOLUME_DB = -18;
const BED_FADE_IN = 0.5;
const BED_FADE_OUT = 1;

export function bedPath() {
  return join(SOUNDTRACKS, 'bed.mp3');
}

/** Voice at −16 LUFS and bed at −18 dB, without lowering the voice in the mix. */
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

/** Voice with a 0.5 s intro and background music; video is copied. */
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
