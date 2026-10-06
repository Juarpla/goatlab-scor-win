import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { bundleDir, buildVideoBundle } from './remotion-build.mjs';
import { FPS, MAX_FRAMES } from '../../src/lib/short-format.js';
let prepared;
async function videoBundle() {
  if (existsSync(join(bundleDir, 'index.html'))) return bundleDir;
  prepared ??= buildVideoBundle().catch(error => { prepared = undefined; throw error; });
  return prepared;
}

/** Each job exposes only its copied media to Chromium on a loopback port. */
export async function renderRemotion(tmp, out, { workers = 1, onProgress = () => {}, cancelSignal, isCancelled = () => false } = {}) {
  const { selectComposition, renderMedia, makeCancelSignal } = await import('@remotion/renderer');
  const props = JSON.parse(readFileSync(join(tmp, 'composition.json'), 'utf8'));
  if (!Number.isInteger(props.frames) || props.frames > MAX_FRAMES) throw new Error('composición supera 49,9 segundos');
  const allowed = new Set([props.font, props.brand, ...props.photos.flatMap(p => [p.src, p.backdrop, p.focusBlur]), ...props.clips.map(c => c.src)]);
  const types = { jpg: 'image/jpeg', svg: 'image/svg+xml', ttf: 'font/ttf', mp4: 'video/mp4' };
  const server = createServer((req, res) => {
    let name;
    try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1)); } catch { res.writeHead(400).end(); return; }
    if (name !== basename(name) || !allowed.has(name) || !existsSync(join(tmp, name))) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[name.split('.').at(-1)] ?? 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    createReadStream(join(tmp, name)).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/`;
    const inputProps = { ...props, font: base + props.font, brand: base + props.brand,
      photos: props.photos.map(p => ({ ...p, src: base + p.src, backdrop: base + p.backdrop, focusBlur: base + p.focusBlur })),
      clips: props.clips.map(c => ({ ...c, src: base + c.src })) };
    const serveUrl = await videoBundle();
    const composition = await selectComposition({ serveUrl, id: 'GoatLabShort', inputProps });
    if (composition.fps !== FPS || composition.durationInFrames !== props.frames) throw new Error('timeline Remotion inesperada');
    const cancellation = makeCancelSignal();
    if (isCancelled()) cancellation.cancel();
    const timeout = setTimeout(() => cancellation.cancel(), 20 * 60 * 1000);
    try { await renderMedia({ serveUrl, composition, inputProps, codec: 'h264', pixelFormat: 'yuv420p', crf: 18,
      outputLocation: out, concurrency: Math.max(1, Math.min(2, Number(workers) || 1)), muted: true, onProgress: progress => { if (isCancelled()) cancellation.cancel(); onProgress(progress); }, cancelSignal: cancelSignal ?? cancellation.cancelSignal }); } finally { clearTimeout(timeout); }
  } finally { await new Promise(resolve => server.close(resolve)); }
}
