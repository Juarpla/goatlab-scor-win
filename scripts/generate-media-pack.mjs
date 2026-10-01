/** Genera media-pack/<webId>.json: Commons, Pexels y Pixabay.
 *  Un modelo de OpenCode Go ve las candidatas y deja 20 confirmadas.
 *  Pexels y Pixabay se omiten si falta la clave. La red vive solo aquí. */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { selectMatches, staleScripts, sameCore } from '../src/lib/youtube.js';
import { esName } from '../src/lib/teams.js';
import { locateMatch } from '../src/lib/venues.js';
import {
  ASSETS_PER_MATCH,
  PLAYER_CANDIDATES,
  SCENE_CANDIDATES,
  THUMB_WIDTH,
  playerNamesFromScripts,
  playerQueries,
  sceneQueries,
  normalizeCommonsPage,
  normalizePexelsPhoto,
  normalizePixabayHit,
  rankAssets,
  buildManifest,
  acceptVisionVerdict,
} from '../src/lib/media.js';
import { agnesPrompts, normalizeAgnesImage } from '../src/lib/agnes.js';
import { checkMediaManifest } from '../src/lib/compliance.js';
import { extractJson, parseRetryAfter, resolveChain, withFailover } from '../src/lib/llm.js';

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
const VISION_ORDER = process.env.VISION_PROVIDER_ORDER?.trim() || 'OPENCODE_GO_MODEL,OPENCODE_GO_FALLBACK_MODEL';
const VISION_PHASE_MAX_MS = envInt('VISION_PHASE_MAX_MS', 600_000);
const VISION_MAX_TOKENS = envInt('VISION_MAX_TOKENS', 15_000);
const VISION_CALL_MS = envInt('VISION_CALL_MS', 120_000);
const VISION_CONCURRENCY = 3;
const AGNES_URL = 'https://apihub.agnes-ai.com/v1/images/generations';
const GEN_BASE = (process.env.MEDIA_GEN_BASE || 'https://goatlab-gateway.fly.dev/media-gen').replace(/\/$/, '');

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

function visionEnv() {
  return { ...process.env, LLM_PROVIDER_ORDER: VISION_ORDER };
}

async function searchCommons({ query, player = null, scene = null }) {
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
      const asset = normalizeCommonsPage(page, query, { player, scene });
      if (asset) found.push(asset);
    }
    cont = data?.continue?.gsroffset;
    if (!cont) break;
  }
  return found;
}

async function searchPexels({ query, player = null, scene = null }) {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) return [];
  const params = new URLSearchParams({ query, per_page: '20' });
  const data = await fetchJson(`https://api.pexels.com/v1/search?${params}`, { authorization: key });
  return (data.photos ?? []).map(photo => normalizePexelsPhoto(photo, query, { player, scene })).filter(Boolean);
}

async function searchPixabay({ query, player = null, scene = null }) {
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
  return (data.hits ?? []).map(hit => normalizePixabayHit(hit, query, { player, scene })).filter(Boolean);
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

async function poolFor(queries, quota) {
  const byId = new Map();
  const searchers = [searchCommons, searchPexels, searchPixabay];
  for (const query of queries) {
    if (byId.size >= quota) break;
    for (const search of searchers) {
      if (byId.size >= quota) break;
      const batch = await search(query).catch((error) => {
        console.error(`media: ${query.query}: ${error.message}`);
        return [];
      });
      for (const asset of batch) {
        if (!byId.has(`${asset.source}:${asset.id}`)) byId.set(`${asset.source}:${asset.id}`, asset);
      }
    }
  }
  return rankAssets([...byId.values()]).slice(0, quota);
}

function visionPrompt(asset, names) {
  if (asset.sceneHint) {
    return [
      'Check this still photo for a football short.',
      `Expected scene: ${asset.sceneHint}.`,
      'Reply with JSON only: {"ok":true|false,"motive":"stadium"|"fans"|"press"|"training"|"team"}.',
      'ok is true only when the photo clearly shows that scene: a stadium, fans or stands in team colours, a press conference, a training session, or a team photo.',
      'ok is false for a logo, a flag alone, a graphic, a broadcast screenshot, or a different scene.',
    ].join(' ');
  }
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
      env: visionEnv(),
      maxTokens: VISION_MAX_TOKENS,
      timeoutMs: VISION_CALL_MS,
      validate(content) {
        const parsed = extractJson(content);
        const accepted = acceptVisionVerdict(parsed, {
          player: asset.playerHint,
          names: asset.sceneHint ? [] : names,
          scene: asset.sceneHint,
        });
        if (!accepted) return { rejected: true };
        return accepted;
      },
    });
    if (result.value?.rejected) return null;
    const rest = { ...asset };
    delete rest.previewUrl;
    delete rest.playerHint;
    delete rest.sceneHint;
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

function sniffImage(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'webp';
  return 'jpg';
}

async function agnesImage(prompt, model, key) {
  const res = await fetch(AGNES_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      size: '2K',
      ratio: '9:16',
      extra_body: { response_format: 'b64_json' },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (res.status === 429) {
    const error = new Error('HTTP 429');
    error.retryAfterMs = parseRetryAfter(res.headers.get('retry-after')) || 15_000;
    throw error;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const item = data?.data?.[0] ?? data?.images?.[0] ?? data;
  const b64 = item?.b64_json ?? item?.base64 ?? null;
  if (b64) {
    const buf = Buffer.from(String(b64).replace(/^data:image\/\w+;base64,/, ''), 'base64');
    if (!buf.length) throw new Error('vacía');
    return { buf, ext: sniffImage(buf) };
  }
  const url = item?.url;
  if (!url || !/^https:\/\//.test(url)) throw new Error('sin imagen');
  const img = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!img.ok) throw new Error(`HTTP ${img.status}`);
  const buf = Buffer.from(await img.arrayBuffer());
  if (!buf.length) throw new Error('vacía');
  return { buf, ext: sniffImage(buf) };
}

/** Como máximo 8 arranques por minuto: el plan gratis de Agnes en 2K ejecuta 10. */
function agnesGate(limit = 8, windowMs = 60_000) {
  const starts = [];
  let chain = Promise.resolve();
  return function takeSlot() {
    const run = chain.then(async () => {
      for (;;) {
        const now = Date.now();
        while (starts.length && now - starts[0] >= windowMs) starts.shift();
        if (starts.length < limit) {
          starts.push(now);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, windowMs - (now - starts[0]) + 50));
      }
    });
    chain = run.then(() => {}, () => {});
    return run;
  };
}

/** Genera solo las fotos que faltan para llegar a 20. Sin clave, no genera. */
async function fillWithAgnes({ matchId, home, away, missing }) {
  const key = process.env.AGNES_API_KEY?.trim();
  const cap = envInt('AGNES_MAX_IMAGES', 20);
  const count = Math.min(missing, cap);
  if (!key || count <= 0) {
    if (missing > 0 && !key) console.error('media: agnes sin clave');
    return [];
  }
  const model = process.env.AGNES_IMAGE_MODEL?.trim() || 'agnes-image-2.1-flash';
  const prompts = agnesPrompts({ home, away, count });
  const folder = join(dir, 'gen', matchId);
  await mkdir(folder, { recursive: true });
  const takeSlot = agnesGate();
  const made = [];
  let cursor = 0;
  async function one(index) {
    await takeSlot();
    try {
      return await agnesImage(prompts[index], model, key);
    } catch (error) {
      if (error.retryAfterMs == null) throw error;
      console.error(`media: agnes ${index}: HTTP 429, reintento`);
      await new Promise(resolve => setTimeout(resolve, error.retryAfterMs));
      await takeSlot();
      return agnesImage(prompts[index], model, key);
    }
  }
  async function worker() {
    while (cursor < prompts.length) {
      const index = cursor;
      cursor += 1;
      try {
        const image = await one(index);
        const file = `${index}.${image.ext}`;
        await writeFile(join(folder, file), image.buf);
        made.push(normalizeAgnesImage({
          matchId,
          index,
          publicUrl: `${GEN_BASE}/${encodeURIComponent(matchId)}/${file}`,
          model,
          prompt: prompts[index],
        }));
      } catch (error) {
        console.error(`media: agnes ${index}: ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 2 }, () => worker()));
  console.log(`media: agnes generó ${made.length} de ${count}`);
  return made;
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
if (!process.env.AGNES_API_KEY?.trim()) console.log('media: sin AGNES_API_KEY, no se generan fotos de apoyo');
{
  const chain = resolveChain(visionEnv(), console);
  console.log(`media: visión con ${chain.map(item => item.model).join(', ') || 'sin proveedores'}`);
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
  const playerQs = [
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
  const located = locateMatch(match);
  const scenes = sceneQueries({
    home: match.home,
    away: match.away,
    venue: located ?? { stadium: match.venue ?? null, city: match.venueCity ?? null },
  });
  const [players, scenePool] = await Promise.all([
    poolFor(playerQs, PLAYER_CANDIDATES),
    poolFor(scenes, SCENE_CANDIDATES),
  ]);
  const candidates = rankAssets([...players, ...scenePool]).slice(0, PLAYER_CANDIDATES + SCENE_CANDIDATES);
  let accepted = await seeAssets(candidates, names);
  if (accepted.length < ASSETS_PER_MATCH) {
    const extra = await fillWithAgnes({
      matchId,
      home: match.home,
      away: match.away,
      missing: ASSETS_PER_MATCH - accepted.length,
    });
    accepted = [...accepted, ...extra];
  }
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
