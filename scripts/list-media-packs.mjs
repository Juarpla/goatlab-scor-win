// Lists the current top matches that already have media ready.
// Source of truth: public/data/top.json (the same ranking the site uses) + media-pack.
// Usage: node scripts/list-media-packs.mjs [--all] [--json]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audioFiles, audioRoot } from '../video-render/contract/layout.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACK_DIR = join(ROOT, 'public/data/media-pack');
const TOP_FILE = join(ROOT, 'public/data/top.json');
const AUDIO_ROOT = process.env.GOATLAB_AUDIO_DIR || audioRoot(ROOT);

const flags = new Set(process.argv.slice(2));
const all = flags.has('--all');
const asJson = flags.has('--json');
const now = Date.now();

const readJson = path => {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
};

const top = readJson(TOP_FILE);
const ranking = Array.isArray(top?.ranking) ? top.ranking : [];
const topById = new Map(ranking.map((row, index) => [row.id, { ...row, rank: index + 1 }]));

const rows = [];
for (const file of readdirSync(PACK_DIR)) {
  if (!file.endsWith('.json') || file.includes('.progress') || file.startsWith('_')) continue;
  const id = basename(file, '.json');
  if (!all && ranking.length && !topById.has(id)) continue;
  const pack = readJson(join(PACK_DIR, file));
  if (!pack) continue;
  const images = Array.isArray(pack.assets) ? pack.assets.length : 0;
  const clips = Array.isArray(pack.clips) ? pack.clips.length : 0;
  if (!images && !clips) continue;
  const meta = topById.get(id);
  const kickoff = meta?.kickoff ?? null;
  const date = (kickoff ?? id.match(/(\d{4}-\d{2}-\d{2})$/)?.[1] ?? '').slice(0, 10);
  const startsAt = kickoff ? Date.parse(kickoff) : Date.parse(`${date}T23:59:59Z`);
  const past = Number.isFinite(startsAt) && startsAt <= now;
  if (!all && past) continue;
  const audioDir = join(AUDIO_ROOT, id);
  const audios = existsSync(audioDir) ? audioFiles(audioDir) : [];
  rows.push({
    id,
    date,
    kickoff,
    past,
    match: meta ? `${meta.home} vs ${meta.away}` : (pack.match ?? `${pack.home ?? ''} vs ${pack.away ?? ''}`),
    top: meta?.rank ?? null,
    images,
    clips,
    audio: audios,
    complete: images >= 4 && clips >= 4,
  });
}

rows.sort((a, b) => (a.kickoff ?? a.date).localeCompare(b.kickoff ?? b.date)
  || (a.top ?? 999) - (b.top ?? 999) || a.match.localeCompare(b.match));

if (asJson) {
  console.log(JSON.stringify({ generatedAt: top?.generatedAt ?? null, rows }, null, 2));
} else {
  const source = all ? 'public/data/media-pack' : `public/data/top.json (${top?.generatedAt ?? 'sin top.json'}) + media-pack`;
  console.log(`${all ? 'Todos los packs de media en disco' : 'Partidos del ranking actual con media lista'} · fuente: ${source}`);
  console.log(`Referencia: ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC · ${all ? 'incluye packs antiguos, marcados como (pasado)' : 'solo se listan partidos que aún no empiezan'}`);
  if (!ranking.length) console.log('Aviso: top.json ausente o inválido; se listan los packs con fecha futura.');
  const ageHours = top?.generatedAt ? (now - Date.parse(top.generatedAt)) / 3_600_000 : null;
  if (Number.isFinite(ageHours) && ageHours > 24) console.log(`Aviso: top.json tiene ${ageHours.toFixed(1)} h; conviene actualizar los datos.`);
  console.log('');
  console.log('| # | Fecha (UTC) | Partido | Top | Img | Clips | Audio | id |');
  console.log('|---|---|---|---|---|---|---|---|');
  rows.forEach((row, index) => {
    const when = row.kickoff ? row.kickoff.slice(0, 16).replace('T', ' ') : row.date;
    const label = row.past ? `${when} (pasado)` : when;
    console.log(`| ${index + 1} | ${label} | ${row.match} | ${row.top ?? '—'} | ${row.images} | ${row.clips} | ${row.audio.join(', ') || '—'} | \`${row.id}\` |`);
  });
  console.log('');
  if (rows.length) {
    console.log(`${rows.length} ${all ? 'pack(s) en disco' : 'partido(s) con media lista que aún no empiezan'}. Elige un número o el id.`);
    if (!all) console.log('Para incluir packs antiguos o fuera del ranking: --all');
  } else {
    console.log('No hay partidos futuros del ranking con media lista.');
    console.log('Actualiza los datos (workflow 1-update-data) o usa --all para ver packs antiguos.');
  }
}
