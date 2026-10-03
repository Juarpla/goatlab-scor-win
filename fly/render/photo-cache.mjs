import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, openSync, writeSync, readdirSync, statSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
const run = promisify(execFile);
const inProgress = new Map();
const leases = new Map();
export function pinPhotos(assets) {
  const keys = assets.map(a => createHash('sha256').update(a.url).digest('hex'));
  for (const key of keys) leases.set(key, (leases.get(key) ?? 0)+1);
  return () => { for (const key of keys) { const n=leases.get(key)-1; if(n) leases.set(key,n); else leases.delete(key); } };
}
let downloading = 0;
const waiters = [];
async function acquire() {
  if (downloading >= 2) await new Promise(resolve => waiters.push(resolve));
  else downloading++;
}
function release() {
  const next = waiters.shift();
  if (next) next();
  else downloading--;
}

export const CACHE_BYTES = 128_000_000;
export function prunePhotoCache(dir, { protectedUrls = [], maxBytes = CACHE_BYTES, purgeUnused = false } = {}) {
  if (!existsSync(dir)) return 0;
  const protectedKeys = new Set(protectedUrls.map(url => createHash('sha256').update(url).digest('hex')));
  for (const key of leases.keys()) protectedKeys.add(key);
  for (const file of inProgress.keys()) protectedKeys.add(file.split('/').at(-1).slice(0, 64));
  const files = readdirSync(dir).map(name => ({ name, path: join(dir, name), ...statSync(join(dir, name)) })).filter(f => statSync(f.path).isFile());
  let total = files.reduce((n, f) => n + f.size, 0);
  for (const file of files.sort((a,b) => a.mtimeMs-b.mtimeMs)) {
    if (protectedKeys.has(file.name.slice(0,64))) continue;
    if (!purgeUnused && total <= maxBytes) break;
    rmSync(file.path, { force: true }); total -= file.size;
  }
  return total;
}

export async function imageDimensions(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file]);
  const stream = JSON.parse(stdout).streams?.[0];
  if (!(stream?.width > 0 && stream?.height > 0)) throw new Error('foto sin dimensiones válidas');
  return { width: stream.width, height: stream.height };
}

/** URL-addressed cache shared across all Shorts; two downloads at most at once. */
export async function cachedPhoto(asset, cacheDir, { fetchImpl = fetch } = {}) {
  mkdirSync(cacheDir, { recursive: true });
  const key = createHash('sha256').update(asset.url).digest('hex');
  const file = join(cacheDir, `${key}.jpg`), meta = join(cacheDir, `${key}.json`), backdrop = join(cacheDir, `${key}-back.jpg`), focusBlur = join(cacheDir, `${key}-focus.jpg`);
  if (existsSync(file) && existsSync(meta) && existsSync(backdrop) && existsSync(focusBlur)) return { path: file, backdrop, focusBlur, ...JSON.parse(readFileSync(meta)), cached: true };
  if (inProgress.has(file)) return inProgress.get(file);
  const operation = (async () => {
    await acquire();
    const raw = `${file}.raw`, temp = `${file}.tmp.jpg`;
    try {
      const response = await fetchImpl(asset.url, { signal: AbortSignal.timeout(60_000), headers: { 'user-agent': 'goatlab-render/1.0 (https://goatlab.win)' } });
      if (!response.ok) throw new Error(`foto HTTP ${response.status}`);
      if (Number(response.headers.get('content-length')) > 64 * 1024 * 1024) throw new Error('foto demasiado grande');
      let size = 0;
      const fd = openSync(raw, "w");
      try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 64 * 1024 * 1024) throw new Error('foto demasiado grande');
        // Reserve space for normalization outputs; never buffer the whole photo.
        if (prunePhotoCache(cacheDir, { maxBytes: CACHE_BYTES - chunk.length - 26_000_000 }) + chunk.length + 26_000_000 > CACHE_BYTES) throw new Error('caché de fotos llena');
        writeSync(fd, chunk);
      }
      } finally { closeSync(fd); }
      const input = await imageDimensions(raw);
      // Keep 2K portrait detail, avoiding the previous width-only reduction.
      const factor = Math.min(1, 1472 / input.width, 2624 / input.height);
      const width = Math.max(2, Math.floor(input.width * factor / 2) * 2);
      const height = Math.max(2, Math.floor(input.height * factor / 2) * 2);
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', `scale=${width}:${height}:flags=lanczos`, '-frames:v', '1', '-q:v', '2', temp], { timeout: 60_000 });
      const dimensions = await imageDimensions(temp);
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', temp, '-vf', 'scale=270:480:force_original_aspect_ratio=increase,crop=270:480,gblur=sigma=12', '-frames:v', '1', '-q:v', '4', `${backdrop}.tmp.jpg`], { timeout: 60_000 });
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', temp, '-vf', "scale='max(2,trunc(iw/8)*2)':'max(2,trunc(ih/8)*2)',gblur=sigma=8", '-frames:v', '1', '-q:v', '4', `${focusBlur}.tmp.jpg`], { timeout: 60_000 });
      writeFileSync(`${meta}.tmp`, JSON.stringify(dimensions));
      renameSync(temp, file);
      renameSync(`${backdrop}.tmp.jpg`, backdrop);
      renameSync(`${focusBlur}.tmp.jpg`, focusBlur);
      renameSync(`${meta}.tmp`, meta);
      return { path: file, backdrop, focusBlur, ...dimensions, cached: false };
    } finally {
      for (const path of [raw, temp, `${backdrop}.tmp.jpg`, `${focusBlur}.tmp.jpg`, `${meta}.tmp`]) rmSync(path, { force: true });
      release();
    }
  })();
  inProgress.set(file, operation);
  try { return await operation; } finally { inProgress.delete(file); }
}

export async function warmPhotos(assets, cacheDir, log = () => {}) {
  let cursor = 0;
  const results = new Array(assets.length);
  await Promise.all(Array.from({ length: Math.min(2, assets.length) }, async () => {
    while (cursor < assets.length) {
      const index = cursor++;
      try { results[index] = await cachedPhoto(assets[index], cacheDir); }
      catch { log(`foto ${index}: descarga o normalización fallida`); results[index] = null; }
    }
  }));
  return results;
}
