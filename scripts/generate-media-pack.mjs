/** Genera media-pack/<webId>.json: Commons, Pexels y Pixabay.
 *  Un modelo de OpenCode Go ve las candidatas y deja 20 confirmadas.
 *  Pexels y Pixabay se omiten si falta la clave. La red vive solo aquí. */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { selectMatches, staleScripts, sameCore } from '../src/lib/youtube.js';
import { esName } from '../src/lib/teams.js';
import {
  ASSETS_PER_MATCH,
  CANDIDATES_PER_MATCH,
  THUMB_WIDTH,
  playerNamesFromScripts,
  playerQueries,
  normalizeCommonsPage,
  normalizePexelsPhoto,
  normalizePixabayHit,
  rankAssets,
  buildManifest,
  acceptVisionVerdict,
} from '../src/lib/media.js';
import { checkMediaManifest } from '../src/lib/compliance.js';
import { extractJson, withFailover } from '../src/lib/llm.js';

const args = new Map(process.argv.slice(2).map(a => {
  const i = a.indexOf('=');
  return i === -1 ? [a, ''] : [a.slice(0, i), a.slice(i + 1)];
}));
const onlyMatch = args.get('--match');
const limitRaw = args.get('--limit');
const dir = args.get('--out') || process.env.MEDIA_PACK_DIR || 'public/data/media-pack';
const fullRun = !onlyMatch && limitRaw == null;
const force = Boolean(onlyMatch) || args.has('--force');
const UA = 'GoatLab/1.0 (https://goatlab.win; media-pack)';
const VISION_ORDER = 'OPENCODE_GO_MODEL,OPENCODE_GO_FALLBACK_MODEL';
const VISION_PHASE_MAX_MS = envInt('VISION_PHASE_MAX_MS', 180_000);
const VISION_CONCURRENCY = 3;

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    let where = 'request';
    try {
      const parsed = new URL(url);
      where = `${parsed.origin}${parsed.pathname}`;
    } catch { /* sin query: no filtrar claves */ }
    throw new Error(`${res.status} ${where}`);
  }
  return res.json();
}

async function searchCommons({ query, player = null }) {
  const found = [];
  let cont = '';
  for (let page = 0; page < 3; page += 1) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrnamespace: '6',
      gsrlimit: '20',
      gsrsearch: `${query} filetype:bitmap`,
      prop: 'imageinfo',
      iiprop: 'url|mime|size|extmetadata',
      iiurlwidth: String(THUMB_WIDTH),
      maxlag: '5',
    });
    if (cont) params.set('gsroffset', cont);
    const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`);
    const pages = Object.values(data?.query?.pages ?? {});
    for (const page of pages) {
      const asset = normalizeCommonsPage(page, query, { player });
      if (asset) found.push(asset);
    }
    cont = data?.continue?.gsroffset;
    if (!cont) break;
  }
  return found;
}

async function searchPexels({ query, player = null }) {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) return [];
  const params = new URLSearchParams({ query, per_page: '20' });
  const data = await fetchJson(`https://api.pexels.com/v1/search?${params}`, { authorization: key });
  return (data.photos ?? []).map(photo => normalizePexelsPhoto(photo, query, { player })).filter(Boolean);
}

async function searchPixabay({ query, player = null }) {
  const key = process.env.PIXABAY_API_KEY?.trim();
  if (!key) return [];
  const params = new URLSearchParams({
    key,
    q: query,
    image_type: 'photo',
    per_page: '20',
    safesearch: 'true',
  });
  const data = await fetchJson(`https://pixabay.com/api/?${params}`);
  return (data.hits ?? []).map(hit => normalizePixabayHit(hit, query, { player })).filter(Boolean);
}

async function namesFor(matchId, home, away) {
  try {
    const script = JSON.parse(await readFile(join('public/data/youtube-scripts', `${matchId}.json`), 'utf8'));
    return playerNamesFromScripts(script.scripts, {
      home: script.home ?? home ?? '',
      away: script.away ?? away ?? '',
    });
  } catch {
    return [];
  }
}

async function poolFor(queries) {
  const byId = new Map();
  const searchers = [searchCommons, searchPexels, searchPixabay];
  for (const query of queries) {
    if (byId.size >= CANDIDATES_PER_MATCH) break;
    for (const search of searchers) {
      if (byId.size >= CANDIDATES_PER_MATCH) break;
      const batch = await search(query).catch((error) => {
        console.error(`media: ${query.query}: ${error.message}`);
        return [];
      });
      for (const asset of batch) {
        if (!byId.has(`${asset.source}:${asset.id}`)) byId.set(`${asset.source}:${asset.id}`, asset);
      }
    }
  }
  return rankAssets([...byId.values()]).slice(0, CANDIDATES_PER_MATCH);
}

function visionPrompt(asset, names) {
  const expected = asset.playerHint
    ? `Expected player: ${asset.playerHint}.`
    : `The player must be one of: ${(names ?? []).join(', ') || 'a named footballer'}.`;
  return [
    'Check this still photo for a football short.',
    expected,
    'Reply with JSON only: {"ok":true|false,"who":"Full name","motive":"training"|"after"|"portrait"}.',
    'ok is true only when that player is clearly the subject, in training, after a match, or a portrait.',
    'ok is false for a different person, a flag, a logo, an empty stadium, a broadcast screenshot, a graphic, or a crowd without one clear player.',
  ].join(' ');
}

async function downloadPreview(asset) {
  const res = await fetch(asset.previewUrl || asset.url, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  let mime = String(res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim().toLowerCase();
  if (mime === 'image/jpg') mime = 'image/jpeg';
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw new Error(mime || 'mime');
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > 1_500_000) throw new Error('tamaño');
  return { mime, b64: buf.toString('base64') };
}

async function judgeAsset(asset, names, deadline) {
  if (Date.now() >= deadline) return null;
  let image;
  try {
    image = await downloadPreview(asset);
  } catch (error) {
    console.error(`media: preview ${asset.source}:${asset.id}: ${error.message}`);
    return null;
  }
  try {
    const result = await withFailover([{
      role: 'user',
      content: [
        { type: 'text', text: visionPrompt(asset, names) },
        { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.b64}` } },
      ],
    }], {
      env: { ...process.env, LLM_PROVIDER_ORDER: VISION_ORDER },
      maxTokens: 800,
      timeoutMs: 45_000,
      validate(content) {
        const parsed = extractJson(content);
        const accepted = acceptVisionVerdict(parsed, { player: asset.playerHint, names });
        if (!accepted) return { rejected: true };
        return accepted;
      },
    });
    if (result.value?.rejected) return null;
    const rest = { ...asset };
    delete rest.previewUrl;
    delete rest.playerHint;
    return {
      ...rest,
      subject: result.value.subject,
      motive: result.value.motive,
      seen: { model: result.model, at: new Date().toISOString() },
    };
  } catch (error) {
    console.error(`media: visión ${asset.source}:${asset.id}: ${error.message}`);
    return null;
  }
}

async function seeAssets(assets, names) {
  const deadline = Date.now() + VISION_PHASE_MAX_MS;
  const accepted = [];
  let cursor = 0;
  async function worker() {
    while (cursor < assets.length && accepted.length < ASSETS_PER_MATCH && Date.now() < deadline) {
      const asset = assets[cursor];
      cursor += 1;
      const judged = await judgeAsset(asset, names, deadline);
      if (judged) accepted.push(judged);
    }
  }
  await Promise.all(Array.from({ length: VISION_CONCURRENCY }, () => worker()));
  return accepted;
}

const fixtures = JSON.parse(await readFile('public/data/fixtures.json', 'utf8'));
let matches = selectMatches(fixtures.matches, { onlyMatch, limit: limitRaw });
if (!matches.length && onlyMatch) {
  matches = (fixtures.matches ?? []).filter(m => m.id === onlyMatch || m.webId === onlyMatch);
}
if (!matches.length) {
  console.error('media: sin partidos NS para generar');
  process.exit(1);
}

if (!process.env.PEXELS_API_KEY?.trim()) console.log('media: sin PEXELS_API_KEY, se omite Pexels');
if (!process.env.PIXABAY_API_KEY?.trim()) console.log('media: sin PIXABAY_API_KEY, se omite Pixabay');

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
  if (prev && !force && checkMediaManifest(prev, { matchId }).length === 0) {
    kept += 1;
    continue;
  }
  if (!process.env.OPENCODE_GO_API_KEY?.trim()) {
    console.error(`${file}: falta OPENCODE_GO_API_KEY para ver las fotos`);
    failures += 1;
    continue;
  }
  const names = await namesFor(matchId, match.home, match.away);
  const queries = [
    ...playerQueries(names),
    ...[
      `${esName(match.home)} footballer`,
      `${esName(match.away)} footballer`,
      `${esName(match.home)} national football team`,
      `${esName(match.away)} national football team`,
      `${match.home} soccer player`,
      `${match.away} soccer player`,
    ].map(query => ({ query })),
  ];
  const candidates = await poolFor(queries);
  const accepted = await seeAssets(candidates, names);
  const payload = { ...buildManifest({ match, assets: accepted }), generatedAt: new Date().toISOString() };
  const errors = checkMediaManifest(payload, { matchId });
  if (errors.length) {
    for (const error of errors) console.error(`${file}: ${error}`);
    failures += 1;
    continue;
  }
  if (prev && sameCore(prev, payload)) {
    console.log(`media: ${file} sin cambios`);
    kept += 1;
    continue;
  }
  await writeFile(file, JSON.stringify(payload, null, 2));
  written += 1;
  console.log(`media: ${file} (${payload.assets.length} fotos vistas, ${names.length} jugadores)`);
}
console.log(`media: ${written} escritos, ${kept} conservados, ${failures} fallos`);
process.exit(failures ? 1 : 0);
