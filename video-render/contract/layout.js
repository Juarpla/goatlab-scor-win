/**
 * Filesystem contract for per-match media. The CLI, the scripts and the tests
 * import this module instead of joining folder names by hand, so the tree
 * cannot drift: audios/<match-id>/ for recordings, videos/<match-id>/ for
 * MP4s, work/<match-id>/ for recipes and audios/tests/ for fixtures.
 */
import { existsSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|flac|aac)$/i;
export const TEST_MATCH = 'tests';
const MATCH_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VIDEO_FILE = /\.mp4$/i;

export function assertMatchId(match) {
  if (typeof match !== 'string' || !MATCH_ID.test(match)) throw new Error(`invalid match id: ${match}`);
  if (match === TEST_MATCH) throw new Error(`"${TEST_MATCH}" is reserved for test media`);
  return match;
}

export function audioRoot(root) {
  return join(root, 'video-render/audios');
}

export function matchAudioDir(root, match) {
  return join(audioRoot(root), assertMatchId(match));
}

export function testAudioDir(root) {
  return join(audioRoot(root), TEST_MATCH);
}

export function videoRoot(root) {
  return join(root, 'video-render/videos');
}

export function matchVideoDir(root, match) {
  return join(videoRoot(root), assertMatchId(match));
}

export function testVideoDir(root) {
  return join(videoRoot(root), TEST_MATCH);
}

export function recipeRoot(root) {
  return join(root, 'video-render/work');
}

export function matchRecipeDir(root, match) {
  return join(recipeRoot(root), assertMatchId(match));
}

/** Audio files in a directory, sorted; READMEs and other files are ignored. */
export function audioFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && AUDIO_EXT.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/** `<match>-<audio>-v<variant>.mp4`, the only name the CLI writes. */
export function videoName(match, audio, variant = 0) {
  assertMatchId(match);
  if (!Number.isInteger(variant) || variant < 0) throw new Error(`invalid variant: ${variant}`);
  const stem = audio.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  return `${match}-${stem}-v${variant}.mp4`;
}

function partsInside(base, file) {
  const path = relative(base, resolve(file));
  if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) return null;
  return path.split(sep);
}

/** A voice recording must already live in audios/<match>/ or audios/tests/. */
export function assertAudioInput(root, file, match) {
  assertMatchId(match);
  const parts = partsInside(audioRoot(root), file);
  if (!parts || parts.length !== 2 || (parts[0] !== match && parts[0] !== TEST_MATCH) || !AUDIO_EXT.test(parts[1])) {
    throw new Error(`audio must be video-render/audios/${match}/<file> or video-render/audios/${TEST_MATCH}/<file>`);
  }
  return resolve(file);
}

/** An output must stay in videos/<match>/ or videos/tests/. */
export function assertVideoOutput(root, file, match) {
  assertMatchId(match);
  const parts = partsInside(videoRoot(root), file);
  if (!parts || parts.length !== 2 || (parts[0] !== match && parts[0] !== TEST_MATCH) || !VIDEO_FILE.test(parts[1])) {
    throw new Error(`output must be video-render/videos/${match}/<file>.mp4 or video-render/videos/${TEST_MATCH}/<file>.mp4`);
  }
  return resolve(file);
}

function entries(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Report every file that breaks the media tree contract. Returns an array of
 * { path, message }; an empty array means the tree is valid. Missing folders
 * are valid (the CLI creates them on demand).
 */
export function layoutProblems(root) {
  const problems = [];
  const report = (path, message) => problems.push({ path, message });
  const validId = (name) => {
    try { assertMatchId(name); return true; } catch { return false; }
  };

  const audios = audioRoot(root);
  for (const entry of entries(audios)) {
    const path = join(audios, entry.name);
    if (entry.name === 'README.md') continue;
    if (entry.name === TEST_MATCH) {
      if (!entry.isDirectory()) { report(path, 'tests must be a folder'); continue; }
      for (const fixture of entries(path)) {
        if (fixture.name === 'README.md') continue;
        if (!fixture.isFile() || !AUDIO_EXT.test(fixture.name)) report(join(path, fixture.name), 'audio fixtures must be audio files');
      }
      continue;
    }
    if (!entry.isDirectory()) { report(path, 'voice recordings must live in audios/<match-id>/'); continue; }
    if (!validId(entry.name)) { report(path, 'folder name must be a match id'); continue; }
    for (const file of entries(path)) {
      if (!file.isFile() || !AUDIO_EXT.test(file.name)) report(join(path, file.name), 'only audio recordings belong in audios/<match-id>/');
    }
  }

  const videos = videoRoot(root);
  for (const entry of entries(videos)) {
    const path = join(videos, entry.name);
    if (entry.name === TEST_MATCH) {
      if (!entry.isDirectory()) { report(path, 'tests must be a folder'); continue; }
      for (const file of entries(path)) {
        if (file.name === '.gitkeep') continue;
        if (!file.isFile() || !VIDEO_FILE.test(file.name)) report(join(path, file.name), 'test renders must be MP4 files');
      }
      continue;
    }
    if (!entry.isDirectory()) { report(path, 'only match folders and tests/ belong in videos/'); continue; }
    if (!validId(entry.name)) { report(path, 'folder name must be a match id'); continue; }
    for (const file of entries(path)) {
      if (!file.isFile() || !VIDEO_FILE.test(file.name)) report(join(path, file.name), 'only MP4 files belong in videos/<match-id>/');
    }
  }

  const recipes = recipeRoot(root);
  for (const entry of entries(recipes)) {
    const path = join(recipes, entry.name);
    if (entry.name === '.gitkeep' && entry.isFile()) continue;
    if (!entry.isDirectory()) { report(path, 'only match folders belong in work/'); continue; }
    if (!validId(entry.name)) { report(path, 'folder name must be a match id'); }
  }

  return problems;
}
