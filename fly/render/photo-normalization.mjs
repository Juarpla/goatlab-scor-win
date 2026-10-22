import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

// One profile for production and benchmark. Changing pixels requires a new cache profile.
export const PHOTO_PROFILE = Object.freeze({ version: 1, maxWidth: 1472, maxHeight: 2624 });
export function photoProfile(maxWidth = PHOTO_PROFILE.maxWidth) {
  if (!Number.isInteger(maxWidth) || maxWidth < 2 || maxWidth > PHOTO_PROFILE.maxWidth) throw new Error('photo-max debe estar entre 2 y 1472');
  return { ...PHOTO_PROFILE, maxWidth, maxHeight: Math.floor(maxWidth * PHOTO_PROFILE.maxHeight / PHOTO_PROFILE.maxWidth) };
}
export function normalizedDimensions(input, profile = PHOTO_PROFILE) {
  if (!(input.width >= 2 && input.height >= 2 && profile.maxWidth >= 2 && profile.maxHeight >= 2)) throw new Error('dimensiones de foto inválidas');
  const factor = Math.min(1, profile.maxWidth / input.width, profile.maxHeight / input.height);
  return { width: Math.max(2, Math.floor(input.width * factor / 2) * 2), height: Math.max(2, Math.floor(input.height * factor / 2) * 2) };
}
export async function imageDimensions(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file]);
  const stream = JSON.parse(stdout).streams?.[0];
  if (!(stream?.width >= 2 && stream?.height >= 2)) throw new Error('foto sin dimensiones válidas');
  return { width: stream.width, height: stream.height };
}
export async function normalizePhoto(input, output, profile = PHOTO_PROFILE) {
  const dimensions = normalizedDimensions(await imageDimensions(input), profile);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-vf', `scale=${dimensions.width}:${dimensions.height}:flags=lanczos`, '-frames:v', '1', '-q:v', '2', output], { timeout: 60_000 });
  return dimensions;
}
export function photoCacheSuffix(profile = PHOTO_PROFILE) {
  return `-v${profile.version}-${profile.maxWidth}x${profile.maxHeight}`;
}
