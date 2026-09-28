/** Genera public/data/media-pack/<webId>.json desde Wikimedia Commons.
 *  Al menos 20 fotos de jugadores (dominio público, CC0, CC BY, CC BY-SA)
 *  y 10 secuencias. Sin Pexels ni Pixabay. La red vive solo aquí. */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { selectMatches, staleScripts, sameCore } from '../src/lib/youtube.js';
import { esName } from '../src/lib/teams.js';
import {
  ASSETS_PER_MATCH,
  THUMB_WIDTH,
  playerNamesFromScripts,
  playerQueries,
  normalizeCommonsPage,
  rankAssets,
  buildManifest,
} from '../src/lib/media.js';
import { checkMediaManifest } from '../src/lib/compliance.js';

const dir = 'public/data/media-pack';
const scriptsDir = 'public/data/youtube-scripts';
const args = new Map(process.argv.slice(2).map(a => a.split('=')));
const onlyMatch = args.get('--match');
const limitRaw = args.get('--limit');
const fullRun = !onlyMatch && limitRaw == null;
const force = Boolean(onlyMatch) || args.has('--force');
const UA = 'GoatLab/1.0 (https://goatlab.win; media-pack)';

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 120)}`);
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

async function namesFor(matchId, home, away) {
  try {
    const script = JSON.parse(await readFile(join(scriptsDir, `${matchId}.json`), 'utf8'));
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
  for (const query of queries) {
    if (byId.size >= ASSETS_PER_MATCH) break;
    const batch = await searchCommons(query).catch((error) => {
      console.error(`media: ${query.query}: ${error.message}`);
      return [];
    });
    for (const asset of batch) {
      if (!byId.has(asset.id)) byId.set(asset.id, asset);
    }
  }
  return rankAssets([...byId.values()]);
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
  if (prev && !force && checkMediaManifest(prev, { matchId }).length === 0) {
    kept += 1;
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
  const assets = await poolFor(queries);
  const payload = { ...buildManifest({ match, assets }), generatedAt: new Date().toISOString() };
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
  console.log(`media: ${file} (${payload.assets.length} fotos, ${names.length} jugadores)`);
}
console.log(`media: ${written} escritos, ${kept} conservados, ${failures} fallos`);
process.exit(failures ? 1 : 0);
