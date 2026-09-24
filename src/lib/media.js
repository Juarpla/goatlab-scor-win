/**
 * Media-pack GoatLab Shorts: fotos genéricas con licencia para fondos Ken Burns.
 * Sin portada por partido: relleno genérico (estadio, hinchada, balón), nada
 * que parezca footage y cero logos. Fuentes: Pexels → Pixabay (APIs con key).
 * Puro y testeable: la red vive en scripts/generate-media-pack.mjs.
 */

/** Pool de búsquedas genéricas; se rota por hash del webId (determinista). */
export const QUERY_POOL = [
  'football stadium night',
  'soccer stadium aerial view',
  'football fans cheering stadium',
  'soccer ball on grass',
  'stadium floodlights night',
  'football crowd flags',
  'empty football stadium',
  'soccer goal net closeup',
];

export const ASSETS_PER_MATCH = 3;

/** Fuentes permitidas en manifiestos (las APIs que usamos). */
export const ALLOWED_SOURCES = ['pexels', 'pixabay'];

/** Dominios de foto prohibidos (agencias, redes sociales). */
export const BANNED_PHOTO_DOMAINS = [
  /gettyimages?/i,
  /apimages?/i,
  /reuters/i,
  /shutterstock/i,
  /alamy/i,
  /instagram/i,
  /facebook/i,
];

export function hashWebId(webId) {
  let h = 0x811c9dc5;
  for (const ch of String(webId ?? '')) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Rota el pool desde el hash: variedad por partido, reproducible. */
export function pickQueries(webId, count = ASSETS_PER_MATCH) {
  const start = hashWebId(webId) % QUERY_POOL.length;
  return Array.from({ length: count }, (_, i) => QUERY_POOL[(start + i) % QUERY_POOL.length]);
}

export function normalizePexelsPhoto(photo, query) {
  if (!photo || typeof photo !== 'object') return null;
  const src = photo.src ?? {};
  const url = src.large2x ?? src.large ?? src.original ?? null;
  if (!photo.id || !url || !photo.photographer) return null;
  return {
    source: 'pexels',
    id: String(photo.id),
    url,
    page: photo.url ?? null,
    photographer: photo.photographer,
    photographerUrl: photo.photographer_url ?? null,
    license: 'Pexels License',
    width: photo.width ?? null,
    height: photo.height ?? null,
    query,
  };
}

export function normalizePixabayHit(hit, query) {
  if (!hit || typeof hit !== 'object') return null;
  const url = hit.fullHDURL ?? hit.largeImageURL ?? null;
  if (!hit.id || !url || !hit.user) return null;
  return {
    source: 'pixabay',
    id: String(hit.id),
    url,
    page: hit.pageURL ?? null,
    photographer: hit.user,
    photographerUrl: hit.user_id ? `https://pixabay.com/users/${hit.user}-${hit.user_id}/` : null,
    license: 'Pixabay Content License',
    width: hit.imageWidth ?? null,
    height: hit.imageHeight ?? null,
    query,
  };
}

export function buildAttribution(assets) {
  const seen = new Map();
  for (const asset of assets ?? []) {
    if (!asset?.photographer || !ALLOWED_SOURCES.includes(asset.source)) continue;
    const key = `${asset.source}|${asset.photographer}`;
    if (!seen.has(key)) {
      seen.set(key, `Foto: ${asset.photographer} / ${asset.source === 'pexels' ? 'Pexels' : 'Pixabay'}`);
    }
  }
  return [...seen.values()].join(' · ');
}

export function buildManifest({ match, assets }) {
  const list = (assets ?? []).filter(Boolean);
  return {
    matchId: match.webId ?? match.id,
    match: `${match.home} vs ${match.away}`,
    competition: match.competition ?? null,
    kickoff: match.kickoff ?? null,
    queries: [...new Set(list.map(a => a.query))],
    assets: list,
    attribution: buildAttribution(list),
  };
}
