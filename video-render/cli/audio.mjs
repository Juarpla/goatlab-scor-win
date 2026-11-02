// Audio gate for a render: create the match folder before the recording exists
// and refuse to continue until exactly one audio is in place.
// Usage:
//   node video-render/cli/audio.mjs prepare <match-id>
//   node video-render/cli/audio.mjs check <match-id> [--audio=<file>]
import { existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAudioInput, assertMatchId, audioFiles, matchAudioDir } from '../contract/layout.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../..');

/** Create audios/<match>/ and return its absolute path. */
export function prepareAudio(root, match) {
  const id = assertMatchId(match);
  const dir = matchAudioDir(root, id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Resolve the recording for a match. With `file`, it must already live inside
 * audios/<match>/ (or audios/tests/); without it, the folder must contain
 * exactly one audio. Throws a readable error otherwise.
 */
export function checkAudio(root, match, file = null) {
  const id = assertMatchId(match);
  const dir = matchAudioDir(root, id);
  if (file) {
    const path = assertAudioInput(root, file, id);
    if (!existsSync(path)) throw new Error(`audio no existe: ${path}`);
    return { dir, file: path, files: audioFiles(dir) };
  }
  const files = audioFiles(dir);
  if (!files.length) throw new Error(`no hay audio en ${dir}`);
  if (files.length > 1) throw new Error(`hay ${files.length} audios en ${dir}: ${files.join(', ')}; elige uno con --audio=<archivo>`);
  return { dir, file: join(dir, files[0]), files };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, matchArg, ...rest] = process.argv.slice(2);
  const flags = Object.fromEntries(rest.map((arg) => {
    const pair = arg.match(/^--([^=]+)=(.*)$/);
    return pair ? [pair[1], pair[2]] : [arg.replace(/^--/, ''), true];
  }));
  const fail = (message, code = 1) => {
    console.error(`audio: ${message}`);
    process.exit(code);
  };

  if (!['prepare', 'check'].includes(command)) {
    fail('uso: node video-render/cli/audio.mjs <prepare|check> <match-id> [--audio=<archivo>]', 2);
  }

  let match;
  try {
    match = assertMatchId(matchArg);
  } catch (error) {
    fail(error.message, 2);
  }

  try {
    if (command === 'prepare') {
      const dir = prepareAudio(ROOT, match);
      console.log(`audio: carpeta lista: ${relative(ROOT, dir)}/`);
      console.log('audio: deja ahí la grabación (mp3, wav, m4a, ogg, flac, aac) y avisa cuando esté. No se renderiza hasta que el audio exista.');
    } else {
      const result = checkAudio(ROOT, match, flags.audio || null);
      console.log(`audio: listo: ${relative(ROOT, result.file)}`);
    }
  } catch (error) {
    fail(error.message);
  }
}
