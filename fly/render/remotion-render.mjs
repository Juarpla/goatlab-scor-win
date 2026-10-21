import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { compositionCsp } from './authored-composition.mjs';
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
  if (!Number.isInteger(props.frames) || props.frames > MAX_FRAMES) throw new Error('composición supera 55 segundos');
  const authored = props.plan?.version === 5;
  let authoredBundle;
  if (authored) {
    try {
      const result = await promisify(execFile)(process.execPath, ['--max-old-space-size=768', fileURLToPath(new URL('./authored-composition.mjs', import.meta.url)), '--bundle', tmp],
        { timeout: 180_000, maxBuffer: 1_000_000, env: { PATH: process.env.PATH, HOME: process.env.HOME } });
      authoredBundle = result.stdout.trim().split('\n').at(-1);
    } catch (error) { throw new Error(`compilación: ${String(error.stderr || error.message).slice(-1200)}`); }
  }
  const allowed = new Set([props.font, props.brand, ...props.photos.flatMap(p => [p.src, p.backdrop, p.focusBlur]), ...props.clips.map(c => c.src)]);
  const types = { jpg: 'image/jpeg', svg: 'image/svg+xml', ttf: 'font/ttf', mp4: 'video/mp4', html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json' };
  const server = createServer((req, res) => {
    let name;
    try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1)); } catch { res.writeHead(400).end(); return; }
    let path;
    if (authored && (name === '' || name.startsWith('bundle/'))) {
      const relative = name ? name.slice(7) : 'index.html';
      const candidate = resolve(authoredBundle, relative);
      if (candidate.startsWith(resolve(authoredBundle) + sep) && existsSync(candidate) && /\.(html|js|css|json|wasm|map)$/.test(candidate)) path = candidate;
    } else if (name === basename(name) && allowed.has(name) && existsSync(join(tmp, name))) path = join(tmp, name);
    if (!path) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.split('.').at(-1)] ?? 'application/octet-stream', 'Access-Control-Allow-Origin': '*', ...(authored ? { 'Content-Security-Policy': compositionCsp() } : {}) });
    createReadStream(path).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/`;
    const inputProps = { ...props, font: base + props.font, brand: base + props.brand,
      photos: props.photos.map(p => ({ ...p, src: base + p.src, backdrop: base + p.backdrop, focusBlur: base + p.focusBlur })),
      clips: props.clips.map(c => ({ ...c, src: base + c.src })) };
    const serveUrl = authored ? base + 'bundle/index.html' : await videoBundle();
    const composition = await selectComposition({ serveUrl, id: 'GoatLabShort', inputProps });
    if (composition.fps !== FPS || composition.durationInFrames !== props.frames) throw new Error('timeline Remotion inesperada');
    const cancellation = makeCancelSignal();
    if (isCancelled()) cancellation.cancel();
    const timeout = setTimeout(() => cancellation.cancel(), 20 * 60 * 1000);
    try { await renderMedia({ serveUrl, composition, inputProps, codec: 'h264', pixelFormat: 'yuv420p', crf: 18,
      outputLocation: out, concurrency: Math.max(1, Math.min(2, Number(workers) || 1)), muted: true, onProgress: progress => { if (isCancelled()) cancellation.cancel(); onProgress(progress); }, cancelSignal: cancelSignal ?? cancellation.cancelSignal }); } finally { clearTimeout(timeout); }
  } finally { await new Promise(resolve => server.close(resolve)); }
}
