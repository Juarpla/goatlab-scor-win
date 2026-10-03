import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
/** Busca fotos por metadatos; Python serializa y persiste las generaciones de Agnes. */
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { selectMatches, staleScripts, sameCore, attentionPlayers } from '../lib/youtube.js';
import {
  AGNES_MAX_IMAGES,
  ASSETS_PER_MATCH,
  CANDIDATES_PER_MATCH,
  THUMB_WIDTH,
  sceneQueries,
  normalizeCommonsPage,
  normalizePexelsPhoto,
  normalizePixabayHit,
  buildManifest,
  relevantAssets,
} from '../lib/media.js';
import { agnesPrompts, normalizeAgnesImage } from '../lib/agnes.js';
import { checkMediaManifest } from '../lib/compliance.js';
const run = promisify(execFile);
const PIPELINE = fileURLToPath(new URL('./', import.meta.url));

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

async function poolFor(queries, quota) {
  const byId = new Map();
  const sources = [searchCommons, searchPexels, searchPixabay];
  // Two queries at a time; keep both teams and several contexts represented.
  for (let i = 0; i < Math.min(queries.length, 16); i += 2) {
    const batches = await Promise.all(queries.slice(i, i + 2).flatMap(query => sources.map(async search => {
      try { return await search(query); }
      catch (error) { console.error(`media: búsqueda HTTP fallida (${query.scene})`); return []; }
    })));
    for (const batch of batches) for (const asset of batch.slice(0, 6)) {
      const key = `${asset.source}:${asset.id}`;
      if (!byId.has(key)) byId.set(key, asset);
    }
  }
  // Relevance is ranked after gathering, not by the order of the providers.
  return [...byId.values()];
}

async function fillWithAgnes({ matchId, home, away, missing, kickoff }) {
  if (!process.env.AGNES_API_KEY?.trim() || missing <= 0) return [];
  const cap = Math.min(envInt('AGNES_MAX_IMAGES', AGNES_MAX_IMAGES), AGNES_MAX_IMAGES);
  const folder = join(dir, 'gen', matchId);
  await mkdir(folder, { recursive: true });
  const prompts = agnesPrompts({ home, away, count: cap });
  const made = [];
  // Start at zero on recovery: Python returns cached slots without a new API call.
  for (let index = 0; index < cap && made.length < missing; index++) {
    const promptFile = join(folder, `${index}.prompt.txt`);
    await writeFile(promptFile, prompts[index]);
    try {
      const { stdout } = await run(process.env.PYTHON_BIN || 'python3', [
        join(PIPELINE, 'agnes.py'), `--match=${matchId}`, `--index=${index}`,
        `--expires-at=${(Date.parse(kickoff) + 86400_000)/1000}`, `--prompt-file=${promptFile}`, `--out=${folder}`,
      ], { env: process.env, timeout: 20 * 60_000, maxBuffer: 1024 * 1024 });
      const saved = JSON.parse(stdout);
      made.push({ ...normalizeAgnesImage({ matchId, index,
        publicUrl: `${GEN_BASE}/${encodeURIComponent(matchId)}/${saved.file}`,
        model: saved.model, prompt: saved.prompt, at: saved.at }),
        width: saved.width, height: saved.height });
    } catch (error) {
      const reason = String(error.stderr || 'generación no completada').trim().slice(0, 200);
      console.error(`media: agnes ${index}: ${reason}`);
      if (/429|pausado/.test(reason)) break;
    }
  }
  return made;
}

const fixtures = JSON.parse(await readFile(join(process.env.GOATLAB_REPO || '.', 'public/data/fixtures.json'), 'utf8'));
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
  let scripts = [];
  try { scripts = JSON.parse(await readFile(join(process.env.GOATLAB_REPO || '.', 'public/data/youtube-scripts', `${matchId}.json`), 'utf8')).scripts || []; } catch { /* fixtures-only search */ }
  const players = attentionPlayers(scripts, { home: match.home, away: match.away });
  const teams = [match.home, match.away].map(name => sceneQueries({ home: name }));
  const scenes = [];
  for (let i = 0; i < Math.max(...teams.map(q => q.length)); i++) {
    for (const queries of teams) if (queries[i]) scenes.push(queries[i]);
  }
  scenes.splice(2, 0, ...players.slice(0, 6).map(player => ({ query: `${player} football portrait`, player, scene: 'portrait' })));
  const candidates = await poolFor(scenes, CANDIDATES_PER_MATCH);
  let accepted = relevantAssets(candidates, { home: match.home, away: match.away, players }).slice(0, ASSETS_PER_MATCH);
  if (accepted.length < ASSETS_PER_MATCH) {
    const extra = await fillWithAgnes({
      matchId,
      kickoff: match.kickoff,
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
  await writeFile(`${file}.tmp`, JSON.stringify(payload, null, 2));
  await rename(`${file}.tmp`, file);
  written += 1;
  console.log(`media: ${file} (${payload.assets.length} recursos seleccionados, ${players.length} protagonistas)`);
}
console.log(`media: ${written} escritos, ${kept} conservados, ${failures} fallos`);
process.exit(failures ? 1 : 0);
