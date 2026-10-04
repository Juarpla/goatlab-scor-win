/**
 * Media-pack GoatLab Shorts: fotos actuales de los dos equipos masculinos.
 * Commons (dominio público, CC0, CC BY, CC BY-SA), Pexels y Pixabay.
 * El generador busca y clasifica metadatos; la revisión visual es opcional.
 * aquí solo se normaliza el pool. Cada audio ordena ese pool al renderizar.
 */
import { esName } from './teams.js';

/** Bank target; an exhausted preparation may finish with zero usable images. */
export const ASSETS_PER_MATCH = 15;
export const ASSETS_MIN = 0;
/** Shared generation budget across all videos of one encounter. */
export const AGNES_MAX_IMAGES = 15;
/** Candidatas de búsqueda antes de seleccionar el pool. */
export const CANDIDATES_PER_MATCH = 60;
/** Plazas reservadas a entrenamiento, entrevista, llegada, hinchas o prensa. */
export const SCENE_SLOTS = 6;
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

export const ALLOWED_SOURCES = ['commons', 'pexels', 'pixabay', 'openverse', 'licensed', 'agnes'];

export const SOURCE_CREDIT = {
  commons: 'Wikimedia Commons',
  pexels: 'Pexels',
  pixabay: 'Pixabay',
  agnes: 'Agnes AI',
  openverse: 'Openverse',
  licensed: 'Fuente con licencia',
};

export const AI_CREDIT = 'Imágenes de apoyo generadas con IA (Agnes AI)';

export const BANNED_PHOTO_DOMAINS = [
  /gettyimages?/i,
  /apimages?/i,
  /reuters/i,
  /shutterstock/i,
  /alamy/i,
  /instagram/i,
  /facebook/i,
];

const SCENE_MOTIVES = new Set(['training', 'interview', 'arrival', 'fans', 'press', 'generated']);
const FILL_MOTIVES = new Set(['portrait']);
const ACCEPTED_MOTIVES = new Set([...SCENE_MOTIVES, ...FILL_MOTIVES]);

const REJECT_FILE = /flag of|\bflag\b|coat of arms|\blogo\b|locator map|\.svg\b|escudo|bandera|\bsignature\b|\bautograph\b|kit (body|socks|shorts|left|right)|pictogram|\bicon\b|\bbadge\b|\bstamp\b|\bwomen\b|\bwoman\b|femenin|f[eé]minin|\bfemale\b|\bwnt\b|\bbroadcast\b|\bscreenshot\b|\btelecast\b/i;

function looksRejected(text) {
  return REJECT_FILE.test(String(text ?? '').replace(/[_-]+/g, ' '));
}

export function isUsableStill(asset) {
  return !looksRejected(`${asset?.url ?? ''} ${asset?.page ?? ''}`);
}

/** Shared candidate/publisher contract: dropping one invalid asset never aborts a bank. */
export function assetErrors(asset) {
  if (!asset || typeof asset !== 'object') return ['recurso vacío'];
  const errors = [];
  if (!ALLOWED_SOURCES.includes(asset.source)) errors.push('fuente no permitida');
  if (!asset.id) errors.push('sin id');
  if (!acceptAssetLicense(asset.source, asset.license)) errors.push('licencia no libre');
  if (!isUsableStill(asset)) errors.push('imagen no utilizable');
  for (const field of ['url','page','photographer']) if (!String(asset[field] ?? '').trim()) errors.push(`sin ${field}`);
  for (const field of ['url','originalUrl','page','photographerUrl','licenseUrl']) {
    const value = String(asset[field] ?? '');
    if (value && (!value.startsWith('https://') || BANNED_PHOTO_DOMAINS.some(p=>p.test(value)))) errors.push(`URL no permitida: ${field}`);
  }
  if (['openverse','licensed'].includes(asset.source) && !asset.licenseUrl) errors.push('sin enlace de licencia');
  return errors;
}

/** Openverse indexes many sites; retain the original author, source page and license. */
export function normalizeOpenverseImage(image, query, {player=null, scene=null}={}) {
  const license = image?.license === 'pdm' ? 'Public domain' : image?.license === 'cc0' ? 'CC0' : `CC ${String(image?.license ?? '').toUpperCase()} ${image?.license_version ?? ''}`;
  const asset = {source:'openverse',id:image?.id,url:image?.url,page:image?.foreign_landing_url,
    photographer:image?.creator,photographerUrl:image?.creator_url?.startsWith('https://') ? image.creator_url : image?.foreign_landing_url,
    license,licenseUrl:image?.license_url,width:image?.width,height:image?.height,title:image?.title ?? '',
    description:(image?.tags ?? []).map(t=>t.name).join(' '),query,subject:subjectFor(player,image?.title),
    motive:photoMotive(image?.title),sceneHint:scene,provider:image?.source};
  return assetErrors(asset).length ? null : asset;
}

export function hashWebId(webId) {
  let h = 0x811c9dc5;
  for (const ch of String(webId ?? '')) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Consultas de entrenamiento, entrevista, llegada, hinchada y prensa. Solo hombres. */
export function sceneQueries({ home = '', away = '' } = {}) {
  const out = [];
  const seen = new Set();
  const add = (query, scene) => {
    const q = String(query ?? '').replace(/\s+/g, ' ').trim();
    const key = q.toLowerCase();
    if (!q || seen.has(key)) return;
    seen.add(key);
    out.push({ query: q, scene });
  };
  for (const team of [home, away]) {
    const names = [];
    for (const name of [team, esName(team)]) {
      const n = String(name ?? '').trim();
      if (n && !names.some(item => item.toLowerCase() === n.toLowerCase())) names.push(n);
    }
    for (const name of names) {
      add(`${name} men's football team training`, 'training');
      add(`${name} men's training session`, 'training');
      add(`${name} men's football team interview`, 'interview');
      add(`${name} men's player interview`, 'interview');
      add(`${name} men's football team arrival`, 'arrival');
      add(`${name} men's team bus`, 'arrival');
      add(`${name} men's football fans`, 'fans');
      add(`${name} men's supporters`, 'fans');
      add(`${name} men's press conference`, 'press');
      add(`${name} men's coach press conference`, 'press');
    }
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
  if (['commons', 'openverse', 'licensed'].includes(source)) return classifyLicense(license);
  const text = String(license ?? '').trim();
  if (source === 'pexels' && /^Pexels License$/i.test(text)) return 'Pexels License';
  if (source === 'pixabay' && /^Pixabay Content License$/i.test(text)) return 'Pixabay Content License';
  if (source === 'agnes' && /^AI generated$/i.test(text)) return 'AI generated';
  return null;
}

/** Miniatura corta para el modelo. La url de render se queda ancha. */
export function commonsPreviewUrl(url) {
  return String(url ?? '').replace(/\/\d+px-/, '/480px-');
}

/**
 * Veredicto del modelo. Hombres adultos, foto actual, y un motivo de
 * entrenamiento, entrevista, llegada, hinchada, prensa o retrato.
 */
export function acceptVisionVerdict(raw) {
  if (!raw || raw.ok !== true) return null;
  if (raw.men === false || raw.current === false) return null;
  const motive = String(raw.motive ?? '').toLowerCase();
  if (!ACCEPTED_MOTIVES.has(motive) || motive === 'generated') return null;
  return { subject: null, motive };
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
  if (/interview|entrevista/.test(t)) return 'interview';
  if (/\bbus\b|arrival|llegada/.test(t)) return 'arrival';
  if (/fan|hincha|supporter|aficion/.test(t)) return 'fans';
  if (/press|prensa|conference/.test(t)) return 'press';
  if (/portrait|retrat|headshot/.test(t)) return 'portrait';
  return 'scene';
}

const MOTIVE_RANK = {
  training: 0, interview: 1, arrival: 2, portrait: 3,
  fans: 4, press: 5, scene: 6, generated: 7,
};

function hintedMotive(blob, scene) {
  const fromText = photoMotive(blob);
  return fromText === 'player' && scene ? scene : fromText;
}

export function normalizeCommonsPage(page, query, { player = null, scene = null } = {}) {
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
    title: page.title ?? '',
    description: plainArtist(meta.ImageDescription?.value),
    date: meta.DateTimeOriginal?.value ?? null,
    previewUrl: commonsPreviewUrl(url),
    playerHint: player || null,
    sceneHint: scene || null,
    subject: subjectFor(player, page.title),
    motive: hintedMotive(blob, scene),
  };
}

function stockAsset(base, blob, player, scene) {
  if (looksRejected(blob)) return null;
  return {
    ...base,
    description: blob,
    playerHint: player || null,
    sceneHint: scene || null,
    subject: subjectFor(player, blob),
    motive: hintedMotive(blob, scene),
  };
}

export function normalizePexelsPhoto(photo, query, { player = null, scene = null } = {}) {
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
  }, `${photo.alt ?? ''} ${photographer}`, player, scene);
}

export function normalizePixabayHit(hit, query, { player = null, scene = null } = {}) {
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
  }, `${hit.tags ?? ''} ${photographer}`, player, scene);
}

/** Escena de contexto. El retrato rellena el resto del pool. */
export function isSceneAsset(asset) {
  return asset?.subject == null && (SCENE_MOTIVES.has(asset?.motive) || asset?.source === 'agnes');
}

/** Reserva plazas de escena y completa con jugadores hasta `total`. */
export function selectAssets(assets, { total = ASSETS_PER_MATCH, sceneSlots = SCENE_SLOTS } = {}) {
  const ranked = rankAssets((assets ?? []).filter(Boolean));
  const scenes = ranked.filter(isSceneAsset);
  const players = ranked.filter(asset => !isSceneAsset(asset));
  const chosenScenes = scenes.slice(0, Math.min(sceneSlots, scenes.length, total));
  const chosenPlayers = players.slice(0, total - chosenScenes.length);
  const short = total - chosenScenes.length - chosenPlayers.length;
  if (short > 0) chosenScenes.push(...scenes.slice(chosenScenes.length, chosenScenes.length + short));
  return rankAssets([...chosenPlayers, ...chosenScenes]).slice(0, total);
}

export function rankAssets(assets) {
  return [...(assets ?? [])].sort((a, b) => {
    const rank = (MOTIVE_RANK[a?.motive] ?? 9) - (MOTIVE_RANK[b?.motive] ?? 9);
    if (rank) return rank;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  });
}

/** Metadata is evidence; the search query alone never establishes identity. */
export function relevantAssets(assets, { home = '', away = '', players = [] } = {}) {
  const names = [home, away, esName(home), esName(away)].map(plainKey).filter(Boolean);
  const scored = assets.flatMap(asset => {
    const text = plainKey(`${asset.title ?? ''} ${asset.description ?? ''}`);
    const team = names.find(name => text.includes(name));
    const player = players.find(name => subjectFor(name, text));
    const football = /football|soccer|futbol|futebol|fussball|calcio|supporter|hincha/.test(text);
    if (assetErrors(asset).length || /american football|rugby|quarterback|gridiron/.test(text)) return [];
    const verifiedPlayer = player && plainKey(player).split(' ').filter(t=>t.length>2).every(token=>text.split(' ').includes(token));
    if (!team && !verifiedPlayer) return [];
    if (!football && !verifiedPlayer && !/stadium|estadio|jersey|camiseta|shirt|kit|supporter|hincha|aficion/.test(text)) return [];
    if (asset.width && asset.height && Math.max(asset.width, asset.height) < 720) return [];
    const date = Date.parse(asset.date ?? '');
    const recent = Number.isFinite(date) && Date.now() - date < 3 * 365 * 86400_000;
    const score = (team ? 8 : 0) + (player ? 8 : 0) + (recent ? 2 : 0) + (football ? 1 : 0);
    const { previewUrl: _preview, playerHint: _player, sceneHint: _scene, ...rest } = asset;
    return [{ ...rest, subject: verifiedPlayer ? player : null, relevance: score,
      selection: { method: 'metadata', team: team ?? null, contextOnly: !team && !verifiedPlayer } }];
  }).sort((a, b) => b.relevance - a.relevance);
  const seen = new Set();
  const unique = scored.filter(asset => {
    const key = asset.url.replace(/\/\d+px-/, '/');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Round-robin identities and contexts: a large result set for one team must
  // not exhaust the shortlist before the opponent or supporting scenes appear.
  const buckets = new Map();
  for (const asset of unique) {
    const key = `${asset.subject || asset.selection.team || 'context'}:${asset.motive || 'scene'}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(asset);
  }
  const diverse = [];
  while (diverse.length < unique.length) for (const bucket of buckets.values()) if (bucket.length) diverse.push(bucket.shift());
  return diverse;
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

const MOTIVE_WORDS = {
  training: ['entren', 'training', 'practica'],
  interview: ['entrevista', 'interview'],
  arrival: ['bus', 'llegada', 'arrival'],
  fans: ['hincha', 'hinchada', 'aficion', 'fans', 'supporter'],
  press: ['prensa', 'press', 'rueda'],
  portrait: ['retrato', 'portrait'],
};

function shuffle(list, rand) {
  const order = [...list];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function rotate(list, n) {
  if (list.length < 2) return list;
  const k = ((n % list.length) + list.length) % list.length;
  return list.slice(k).concat(list.slice(0, k));
}

/**
 * Orden nuevo para un audio. Lo que nombra la voz va primero.
 * El resto cambia con la variante, así cada video no repite el mismo corte.
 */
export function orderPool(assets, { variant = 0, words = [], home = '', away = '' } = {}) {
  const list = (assets ?? []).filter(photo => photo?.url);
  if (list.length < 2) return null;
  const spoken = plainKey((words ?? []).map(word => (typeof word === 'string' ? word : word?.word)).join(' '));
  const teams = [home, away, esName(home), esName(away)].map(plainKey).filter(name => name.length > 2);
  const mentionedTeams = teams.filter(name => spoken.includes(name));
  const mentioned = new Set(
    Object.entries(MOTIVE_WORDS)
      .filter(([, keys]) => keys.some(key => spoken.includes(plainKey(key))))
      .map(([motive]) => motive),
  );
  const rand = mulberry32(hashWebId(`${variant}:${spoken.slice(0, 80)}`));
  const front = [];
  const rest = [];
  for (const photo of list) {
    const blob = plainKey(`${photo.query ?? ''} ${photo.subject ?? ''}`);
    const hitMotive = mentioned.has(photo.motive);
    const hitTeam = mentionedTeams.some(name => blob.includes(name));
    if (hitMotive || hitTeam) front.push(photo);
    else rest.push(photo);
  }
  const ordered = [...shuffle(front, rand), ...rotate(shuffle(rest, rand), variant)];
  return {
    camera: CAMERA_MOVES[Math.abs(Number(variant) || 0) % CAMERA_MOVES.length],
    photos: ordered.map(photo => photo.url),
    subjects: ordered.map(photo => photo.subject ?? null),
    motives: ordered.map(photo => photo.motive ?? null),
  };
}

export function buildAttribution(assets) {
  const seen = new Map();
  let generated = false;
  for (const asset of assets ?? []) {
    if (asset?.source === 'agnes') {
      generated = true;
      continue;
    }
    if (!asset?.photographer || !ALLOWED_SOURCES.includes(asset.source)) continue;
    const key = `${asset.photographer}|${asset.license}`;
    if (!seen.has(key)) {
      const credit = SOURCE_CREDIT[asset.source] ?? asset.source;
      seen.set(key, `Foto: ${asset.photographer} / ${credit} (${asset.license})${asset.page ? ` · ${asset.page}` : ''}${asset.licenseUrl ? ` · ${asset.licenseUrl}` : ''}`);
    }
  }
  const lines = [...seen.values()];
  if (generated) lines.push(AI_CREDIT);
  return lines.join(' · ');
}

export function buildManifest({ match, assets }) {
  const list = selectAssets(assets);
  const matchId = match.webId ?? match.id;
  return {
    matchId,
    match: `${esName(match.home)} vs ${esName(match.away)}`,
    competition: match.competition ?? null,
    kickoff: match.kickoff ?? null,
    queries: [...new Set(list.map(a => a.query).filter(Boolean))],
    assets: list,
    attribution: buildAttribution(list),
  };
}
