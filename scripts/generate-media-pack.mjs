/** Genera public/data/media-pack/<webId>.json (fotos genéricas con licencia).
 *  Default: todos los NS de fixtures.json. Solo llama a la API cuando el
 *  manifiesto no existe (--match fuerza refresco). En corrida completa
 *  (sin --match/--limit) poda además los manifiestos rancios.
 *  Keys por env: PEXELS_API_KEY, PIXABAY_API_KEY (nunca commitear). */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { selectMatches, staleScripts, sameCore } from '../src/lib/youtube.js';
import {
  pickQueries,
  hashWebId,
  normalizePexelsPhoto,
  normalizePixabayHit,
  buildManifest,
} from '../src/lib/media.js';
import { checkMediaManifest } from '../src/lib/compliance.js';

const dir = 'public/data/media-pack';
const args = new Map(process.argv.slice(2).map(a => a.split('=')));
const onlyMatch = args.get('--match');
const limitRaw = args.get('--limit');
const fullRun = !onlyMatch && limitRaw == null;
const force = Boolean(onlyMatch);

const PEXELS_KEY = (process.env.PEXELS_API_KEY ?? '').trim();
const PIXABAY_KEY = (process.env.PIXABAY_API_KEY ?? '').trim();
if (!PEXELS_KEY && !PIXABAY_KEY) {
  console.error('media: faltan PEXELS_API_KEY y PIXABAY_API_KEY en el entorno');
  process.exit(1);
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'GoatLab/1.0', ...headers },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function searchPexels(query, seed) {
  const data = await fetchJson(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=3`,
    { Authorization: PEXELS_KEY },
  );
  const photos = Array.isArray(data.photos) ? data.photos : [];
  if (!photos.length) return null;
  return normalizePexelsPhoto(photos[seed % photos.length], query);
}

async function searchPixabay(query, seed) {
  const data = await fetchJson(
    `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&orientation=horizontal&image_type=photo&safesearch=true&per_page=3`,
  );
  const hits = Array.isArray(data.hits) ? data.hits : [];
  if (!hits.length) return null;
  return normalizePixabayHit(hits[seed % hits.length], query);
}

async function resolveAsset(query, seed) {
  if (PEXELS_KEY) {
    const hit = await searchPexels(query, seed).catch(() => null);
    if (hit) return hit;
  }
  if (PIXABAY_KEY) {
    const hit = await searchPixabay(query, seed).catch(() => null);
    if (hit) return hit;
  }
  return null;
}

const fixtures = JSON.parse(await readFile('public/data/fixtures.json', 'utf8'));

let matches = selectMatches(fixtures.matches, { onlyMatch, limit: limitRaw });
if (!matches.length) {
  console.error('media: sin partidos NS para generar');
  process.exit(1);
}

await mkdir(dir, { recursive: true });
if (fullRun) {
  const live = matches.map(m => m.webId ?? m.id);
  for (const file of staleScripts(await readdir(dir), live)) {
    await rm(join(dir, file));
    console.log(`media: poda ${file}`);
  }
}

let failures = 0, written = 0, kept = 0;
for (const match of matches) {
  const matchId = match.webId ?? match.id;
  const file = join(dir, `${matchId}.json`);
  let prev = null;
  try {
    prev = JSON.parse(await readFile(file, 'utf8'));
  } catch { /* nuevo manifiesto */ }
  // Sin llamadas a la API si el manifiesto ya existe (solo --match refresca).
  if (prev && !force) {
    for (const error of checkMediaManifest(prev, { matchId })) {
      console.error(`${file}: ${error}`);
      failures += 1;
    }
    kept += 1;
    continue;
  }
  const seed = hashWebId(matchId);
  const assets = [];
  for (const query of pickQueries(matchId)) {
    const asset = await resolveAsset(query, seed);
    if (!asset) {
      console.error(`${file}: sin foto para "${query}" (Pexels y Pixabay fallaron)`);
      failures += 1;
    } else {
      assets.push(asset);
    }
  }
  const payload = { ...buildManifest({ match, assets }), generatedAt: new Date().toISOString() };
  for (const error of checkMediaManifest(payload, { matchId })) {
    console.error(`${file}: ${error}`);
    failures += 1;
  }
  if (prev && sameCore(prev, payload)) {
    console.log(`media: ${file} sin cambios`);
    kept += 1;
    continue;
  }
  await writeFile(file, JSON.stringify(payload, null, 2));
  written += 1;
  console.log(`media: ${file} (${assets.length} fotos)`);
}
console.log(`media: ${written} escritos, ${kept} conservados, ${failures} fallos`);
process.exit(failures ? 1 : 0);
