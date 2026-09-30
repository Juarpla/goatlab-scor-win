/**
 * Media-pack GoatLab Shorts: fotos de jugadores.
 * Commons (dominio público, CC0, CC BY, CC BY-SA), Pexels y Pixabay.
 * El generador (scripts/generate-media-pack.mjs) hace la red y la visión;
 * aquí solo se normaliza, se arman las 10 secuencias y se valida la forma.
 */
import { esName } from './teams.js';

export const ASSETS_PER_MATCH = 20;
/** Candidatas que el modelo puede mirar antes de quedarse con 20. */
export const CANDIDATES_PER_MATCH = 40;
export const SEQUENCES_PER_MATCH = 10;
export const PHOTOS_PER_SEQUENCE = 12;
/** Ancho de la miniatura de Commons: nítida al cubrir 1080x1920 con recorrido. */
export const THUMB_WIDTH = 1440;

/** Un recorrido distinto por secuencia. No es un único zoom. */
export const CAMERA_MOVES = [
  'pan-left',
  'pan-right',
  'push',
  'pull',
  'tilt',
  'rise',
  'drift',
  'cut-in',
  'slide',
  'hold-push',
];

/** Guiones 3, 4, 7 y 9: ahí el relato nombra jugadores. */
export const PLAYER_SCRIPT_INDEXES = [2, 3, 6, 8];

export const ALLOWED_SOURCES = ['commons', 'pexels', 'pixabay'];

export const SOURCE_CREDIT = {
  commons: 'Wikimedia Commons',
  pexels: 'Pexels',
  pixabay: 'Pixabay',
};

export const BANNED_PHOTO_DOMAINS = [
  /gettyimages?/i,
  /apimages?/i,
  /reuters/i,
  /shutterstock/i,
  /alamy/i,
  /instagram/i,
  /facebook/i,
];

const VISION_MOTIVES = new Set(['training', 'after', 'portrait']);

const REJECT_FILE = /flag of|\bflag\b|coat of arms|\blogo\b|locator map|\.svg\b|escudo|bandera|\bsignature\b|\bautograph\b|kit (body|socks|shorts|left|right)|pictogram|\bicon\b|\bbadge\b|\bstamp\b|football field|soccer field/i;

function looksRejected(text) {
  return REJECT_FILE.test(String(text ?? '').replace(/[_-]+/g, ' '));
}

export function isUsableStill(asset) {
  return !looksRejected(`${asset?.url ?? ''} ${asset?.page ?? ''}`);
}

export function hashWebId(webId) {
  let h = 0x811c9dc5;
  for (const ch of String(webId ?? '')) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const NAME_STOP = new Set([
  'el', 'la', 'los', 'las', 'en', 'si', 'lo', 'y', 'por', 'desde', 'detrás', 'detras',
  'ojo', 'cuál', 'cual', 'esa', 'ese', 'un', 'una', 'delante', 'toda', 'ahí', 'ahi',
  'para', 'cuando', 'esta', 'este', 'con', 'que', 'hay', 'también', 'tambien',
  'marcar', 'creando', 'antes', 'bajo', 'quien', 'quién', 'esas', 'aunque', 'entre',
  'ni', 'del',
]);

function teamTokens(home, away) {
  const tokens = new Set();
  for (const name of [home, away, esName(home), esName(away)]) {
    const full = String(name ?? '').trim().toLowerCase();
    if (!full) continue;
    tokens.add(full);
    for (const part of full.split(/\s+/)) {
      if (part.length >= 4 && !['del', 'de', 'and', 'the'].includes(part)) tokens.add(part);
    }
  }
  return tokens;
}

/** Nombres propios en los guiones de jugadores. Omite equipos y arranques de frase. */
export function playerNamesFromScripts(scripts, { home = '', away = '' } = {}) {
  const banned = teamTokens(home, away);
  const found = [];
  const seen = new Set();
  for (const index of PLAYER_SCRIPT_INDEXES) {
    const text = String(scripts?.[index]?.narration ?? '');
    for (const match of text.matchAll(/\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)*/gu)) {
      const tokens = match[0].trim().split(/\s+/).filter(token => {
        const key = token.toLowerCase();
        return token.length >= 2 && !NAME_STOP.has(key) && !banned.has(key);
      });
      if (!tokens.length) continue;
      const name = tokens.join(' ');
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(name);
    }
  }
  return found;
}

/** Consultas por jugador. `player` viaja con la consulta para el rótulo. */
export function playerQueries(names) {
  const out = [];
  for (const name of names ?? []) {
    const n = String(name).trim();
    if (!n) continue;
    out.push({ query: `${n} footballer`, player: n });
    out.push({ query: `${n} soccer`, player: n });
  }
  return out;
}

function plainKey(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * El nombre del jugador solo si su apellido está en el título del archivo.
 * Una búsqueda por nombre también trae fotos de compañeros o rivales.
 */
export function subjectFor(player, title) {
  const name = String(player ?? '').trim();
  const tokens = plainKey(name).split(' ').filter(Boolean);
  const surname = tokens.at(-1) ?? '';
  const words = new Set(plainKey(title).split(' '));
  if (!words.has(surname)) return null;
  if (tokens.length === 1) return surname.length >= 4 ? name : null;
  return surname.length >= 5 || words.has(tokens[0]) ? name : null;
}

/** null si la licencia no es de uso comercial. NC y ND quedan fuera. */
export function classifyLicense(shortName) {
  const s = String(shortName ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/non.?commercial|\bNC\b|no.?deriv|\bND\b/i.test(s)) return null;
  if (/cc0|public domain/i.test(s)) return s;
  if (/CC\s*BY-SA/i.test(s)) return s;
  if (/CC\s*BY\b/i.test(s)) return s;
  return null;
}

/** Licencia según la fuente. Pexels y Pixabay no son Creative Commons. */
export function acceptAssetLicense(source, license) {
  if (source === 'commons') return classifyLicense(license);
  const text = String(license ?? '').trim();
  if (source === 'pexels' && /^Pexels License$/i.test(text)) return 'Pexels License';
  if (source === 'pixabay' && /^Pixabay Content License$/i.test(text)) return 'Pixabay Content License';
  return null;
}

/** Miniatura corta para el modelo. La url de render se queda ancha. */
export function commonsPreviewUrl(url) {
  return String(url ?? '').replace(/\/\d+px-/, '/480px-');
}

/**
 * Veredicto del modelo. `ok` solo vale si el motivo es entrenamiento,
 * después del partido o retrato, y el apellido coincide con el jugador buscado.
 */
export function acceptVisionVerdict(raw, { player = null, names = [] } = {}) {
  if (!raw || raw.ok !== true) return null;
  const motive = String(raw.motive ?? '').toLowerCase();
  if (!VISION_MOTIVES.has(motive)) return null;
  const who = String(raw.who ?? '').trim();
  if (!who) return null;
  const pool = player ? [String(player)] : (names ?? []).map(name => String(name));
  const subject = pool.find(name => subjectFor(name, who));
  if (!subject) return null;
  return { subject, motive };
}

export function plainArtist(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function photoMotive(text) {
  const t = String(text ?? '').toLowerCase();
  if (/train|entren/.test(t)) return 'training';
  if (/after the match|post-match|después|despues|celebration|celebraci/.test(t)) return 'after';
  if (/portrait|retrat|headshot/.test(t)) return 'portrait';
  return 'player';
}

const MOTIVE_RANK = { training: 0, after: 1, portrait: 2, player: 3 };

export function normalizeCommonsPage(page, query, { player = null } = {}) {
  if (!page || typeof page !== 'object') return null;
  const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
  if (!info) return null;
  if (!/^image\/(jpeg|png|webp)$/.test(String(info.mime ?? ''))) return null;
  const meta = info.extmetadata ?? {};
  const license = classifyLicense(meta.LicenseShortName?.value);
  if (!license) return null;
  const photographer = plainArtist(meta.Artist?.value);
  if (!photographer) return null;
  const url = info.thumburl ?? info.url ?? null;
  const pageUrl = info.descriptionurl ?? null;
  if (!url || !pageUrl || !/^https:\/\//.test(url) || !/^https:\/\//.test(pageUrl)) return null;
  const blob = `${page.title ?? ''} ${plainArtist(meta.ImageDescription?.value)}`;
  if (looksRejected(blob)) return null;
  const id = String(page.pageid ?? '');
  if (!id) return null;
  return {
    source: 'commons',
    id,
    url,
    page: pageUrl,
    photographer,
    photographerUrl: pageUrl,
    license,
    width: info.thumbwidth ?? info.width ?? null,
    height: info.thumbheight ?? info.height ?? null,
    query,
    previewUrl: commonsPreviewUrl(url),
    playerHint: player || null,
    subject: subjectFor(player, page.title),
    motive: photoMotive(blob),
  };
}

function stockAsset(base, blob, player) {
  if (looksRejected(blob)) return null;
  return {
    ...base,
    playerHint: player || null,
    subject: subjectFor(player, blob),
    motive: photoMotive(blob),
  };
}

export function normalizePexelsPhoto(photo, query, { player = null } = {}) {
  if (!photo || typeof photo !== 'object') return null;
  const src = photo.src ?? {};
  const url = src.large2x || src.large || src.original || null;
  const previewUrl = src.medium || src.small || url;
  const page = photo.url ?? null;
  const photographer = String(photo.photographer ?? '').trim();
  if (!photo.id || !url || !previewUrl || !page || !photographer) return null;
  if (![url, previewUrl, page].every(value => /^https:\/\//.test(value))) return null;
  const photographerUrl = /^https:\/\//.test(String(photo.photographer_url ?? '')) ? photo.photographer_url : page;
  return stockAsset({
    source: 'pexels',
    id: String(photo.id),
    url,
    previewUrl,
    page,
    photographer,
    photographerUrl,
    license: 'Pexels License',
    width: photo.width ?? null,
    height: photo.height ?? null,
    query,
  }, `${photo.alt ?? ''} ${photographer}`, player);
}

export function normalizePixabayHit(hit, query, { player = null } = {}) {
  if (!hit || typeof hit !== 'object') return null;
  const url = hit.largeImageURL || hit.webformatURL || null;
  const previewUrl = hit.webformatURL || hit.previewURL || url;
  const page = hit.pageURL ?? null;
  const photographer = String(hit.user ?? '').trim();
  if (!hit.id || !url || !previewUrl || !page || !photographer) return null;
  if (![url, previewUrl, page].every(value => /^https:\/\//.test(value))) return null;
  return stockAsset({
    source: 'pixabay',
    id: String(hit.id),
    url,
    previewUrl,
    page,
    photographer,
    photographerUrl: page,
    license: 'Pixabay Content License',
    width: hit.imageWidth ?? null,
    height: hit.imageHeight ?? null,
    query,
  }, `${hit.tags ?? ''} ${photographer}`, player);
}

export function rankAssets(assets) {
  return [...(assets ?? [])].sort((a, b) => {
    const rank = (MOTIVE_RANK[a?.motive] ?? 9) - (MOTIVE_RANK[b?.motive] ?? 9);
    if (rank) return rank;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  });
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 10 secuencias de hasta 12 fotos del pool, cada una con otro orden. */
export function buildSequences(assets, webId) {
  const list = (assets ?? []).filter(photo => photo?.id);
  if (!list.length) return [];
  const seed = hashWebId(webId);
  const count = Math.min(PHOTOS_PER_SEQUENCE, list.length);
  return Array.from({ length: SEQUENCES_PER_MATCH }, (_, variant) => {
    const rand = mulberry32(seed + Math.imul(variant + 1, 0x9e3779b1));
    const order = [...list];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const photos = order.slice(0, count);
    return {
      variant,
      camera: CAMERA_MOVES[variant % CAMERA_MOVES.length],
      photos: photos.map(photo => photo.url),
      subjects: photos.map(photo => photo.subject ?? null),
    };
  });
}

export function buildAttribution(assets) {
  const seen = new Map();
  for (const asset of assets ?? []) {
    if (!asset?.photographer || !ALLOWED_SOURCES.includes(asset.source)) continue;
    const key = `${asset.photographer}|${asset.license}`;
    if (!seen.has(key)) {
      const credit = SOURCE_CREDIT[asset.source] ?? asset.source;
      seen.set(key, `Foto: ${asset.photographer} / ${credit} (${asset.license})`);
    }
  }
  return [...seen.values()].join(' · ');
}

export function buildManifest({ match, assets }) {
  const list = rankAssets((assets ?? []).filter(Boolean)).slice(0, ASSETS_PER_MATCH);
  const matchId = match.webId ?? match.id;
  return {
    matchId,
    match: `${esName(match.home)} vs ${esName(match.away)}`,
    competition: match.competition ?? null,
    kickoff: match.kickoff ?? null,
    queries: [...new Set(list.map(a => a.query).filter(Boolean))],
    assets: list,
    sequences: buildSequences(list, matchId),
    attribution: buildAttribution(list),
  };
}
