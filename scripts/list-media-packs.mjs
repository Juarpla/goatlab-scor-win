// Lists matches with a local media pack, their images, clips and available audios.
// Usage: node scripts/list-media-packs.mjs [--json]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACK_DIR = join(ROOT, 'public/data/media-pack');
const AUDIO_ROOT = process.env.GOATLAB_AUDIO_DIR || join(ROOT, 'video-render/audios');
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|flac|aac)$/i;

const rows = [];
for (const file of readdirSync(PACK_DIR)) {
  if (!file.endsWith('.json') || file.includes('.progress') || file.startsWith('_')) continue;
  const id = basename(file, '.json');
  let pack;
  try { pack = JSON.parse(readFileSync(join(PACK_DIR, file), 'utf8')); }
  catch { continue; }
  const assets = Array.isArray(pack.assets) ? pack.assets.length : 0;
  const clips = Array.isArray(pack.clips) ? pack.clips.length : 0;
  if (!assets && !clips) continue;
  const date = id.match(/(\d{4}-\d{2}-\d{2})$/)?.[1] ?? '';
  const audioDir = join(AUDIO_ROOT, id);
  const audios = existsSync(audioDir)
    ? readdirSync(audioDir).filter(name => AUDIO_EXT.test(name))
    : [];
  rows.push({ id, date, match: pack.match ?? id, images: assets, clips, audio: audios });
}
rows.sort((a, b) => a.date.localeCompare(b.date) || a.match.localeCompare(b.match));

if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
else {
  console.log(`Partidos con material en ${PACK_DIR}`);
  console.log('id\tfecha\timágenes\tclips\taudio\tpartido');
  for (const row of rows) {
    console.log(`${row.id}\t${row.date}\t${row.images}\t${row.clips}\t${row.audio.join(', ') || '—'}\t${row.match}`);
  }
  console.log(`\nAudios: ${AUDIO_ROOT}/<id>/`);
}
