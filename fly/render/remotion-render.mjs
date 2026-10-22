import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { cpus, totalmem } from 'node:os';
import { compositionCsp } from './authored-composition.mjs';
import { bundleDir, buildVideoBundle } from './remotion-build.mjs';
import { FPS, MAX_FRAMES } from '../../src/lib/short-format.js';
import { projectCapture, budgetError } from './capture-budget.mjs';
import { classifyLayout, layoutMessages } from './layout-check.mjs';
import { recordRenderStart, recordRenderProgress } from './render-metrics.mjs';

let prepared;
async function videoBundle() {
  if (existsSync(join(bundleDir, 'index.html'))) return bundleDir;
  prepared ??= buildVideoBundle().catch(error => { prepared = undefined; throw error; });
  return prepared;
}

const median = values => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Each job exposes only its copied media to Chromium on a loopback port. */
export async function renderRemotion(tmp, out, { workers = 1, onProgress = () => {}, cancelSignal, isCancelled = () => false } = {}) {
  const { selectComposition, renderMedia, renderStill, openBrowser, makeCancelSignal } = await import('@remotion/renderer');
  const props = JSON.parse(readFileSync(join(tmp, 'composition.json'), 'utf8'));
  if (!Number.isInteger(props.frames) || props.frames > MAX_FRAMES) throw new Error('composición supera 55 segundos');
  const authored = props.plan?.version === 5;
  let authoredBundle, bundleMs = 0;
  if (authored) {
    const at = Date.now();
    try {
      const result = await promisify(execFile)(process.execPath, ['--max-old-space-size=768', fileURLToPath(new URL('./authored-composition.mjs', import.meta.url)), '--bundle', tmp],
        { timeout: 180_000, maxBuffer: 1_000_000, env: { PATH: process.env.PATH, HOME: process.env.HOME } });
      authoredBundle = result.stdout.trim().split('\n').at(-1);
    } catch (error) { throw new Error(`compilación: ${String(error.stderr || error.message).slice(-1200)}`); }
    bundleMs = Date.now() - at;
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
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  const concurrency = Math.max(1, Math.min(cpus().length, Number(workers) || 1));
  const threads = String(Math.max(2, Math.floor(cpus().length / 2)));
  // captureMs is wall time inside renderMedia, including encoding, retained for compatibility.
  const metrics = { renderedDoneIn: null, encodedDoneIn: null, resolvedConcurrency: null, parallelEncoding: null, slowestFrames: [], bundleMs, preflightMs: [], captureMs: 0, frames: props.frames, captureFps: 0, workers: concurrency, cpus: cpus().length, memMb: Math.round(totalmem() / 1e6), layout: [] };
  try {
    const base = `http://127.0.0.1:${server.address().port}/`;
    const inputProps = { ...props, font: base + props.font, brand: base + props.brand,
      photos: props.photos.map(p => ({ ...p, src: base + p.src, backdrop: base + p.backdrop, focusBlur: base + p.focusBlur })),
      clips: props.clips.map(c => ({ ...c, src: base + c.src })) };
    const serveUrl = authored ? base + 'bundle/index.html' : await videoBundle();
    const gl = process.env.REMOTION_GL;
    browser = await openBrowser('chrome', gl ? { chromiumOptions: { gl } } : {});
    const composition = await selectComposition({ serveUrl, id: 'GoatLabShort', inputProps, puppeteerInstance: browser });
    if (composition.fps !== FPS || composition.durationInFrames !== props.frames) throw new Error('timeline Remotion inesperada');
    const cancellation = makeCancelSignal();
    if (isCancelled()) cancellation.cancel();
    const timeout = setTimeout(() => cancellation.cancel(), Number(process.env.CAPTURE_TIMEOUT_MS || 20 * 60 * 1000));
    try {
      if (authored) {
        const last = Math.max(0, props.contentFrames - 1);
        const samples = [...new Set([Math.floor(last / 3), Math.floor((2 * last) / 3), last])];
        const probes = [];
        const still = async (frame, timed) => {
          const at = Date.now();
          await renderStill({ serveUrl, composition, inputProps: { ...inputProps, layoutProbe: true }, puppeteerInstance: browser,
            frame, scale: 1, output: null, imageFormat: 'jpeg', timeoutInMilliseconds: 20_000,
            onBrowserLog: entry => {
              const text = String(entry?.text ?? entry?.message ?? '');
              if (!text.startsWith('GOATLAB_LAYOUT ')) return;
              try { probes.push(JSON.parse(text.slice('GOATLAB_LAYOUT '.length))); } catch { /* ignore malformed probe */ }
            },
            cancelSignal: cancelSignal ?? cancellation.cancelSignal });
          if (timed) metrics.preflightMs.push(Date.now() - at);
        };
        await still(0, false);
        for (const frame of samples) {
          if (isCancelled()) cancellation.cancel();
          await still(frame, true);
        }
        const perFrameMs = median(metrics.preflightMs);
        const projected = projectCapture({ perFrameMs, frames: props.frames, workers: concurrency });
        const overBudget = budgetError({ projectedMs: projected, perFrameMs });
        if (overBudget) throw overBudget;
        const layout = classifyLayout(probes);
        const mode = process.env.LAYOUT_CHECK || 'advisory';
        if (mode === 'strict' && layout.severe.length) {
          const first = layout.severe[0];
          throw Object.assign(new Error(`diseño: texto recortado o fuera del lienzo: "${first.text}" en el fotograma ${first.frame}`), { code: 'LAYOUT' });
        }
        if (mode !== 'off') metrics.layout = layoutMessages(layout);
      }
      const captureAt = Date.now();
      const result = await renderMedia({ serveUrl, composition, inputProps, puppeteerInstance: browser,
        codec: 'h264', pixelFormat: 'yuv420p', crf: 20, x264Preset: 'veryfast', disallowParallelEncoding: false,
        ffmpegOverride: ({ args }) => ['-threads', threads, ...args.slice(0, -1), '-threads', threads, args.at(-1)],
        outputLocation: out, concurrency, muted: true,
        onStart: start => recordRenderStart(metrics, start),
        onProgress: progress => { recordRenderProgress(metrics, progress); if (isCancelled()) cancellation.cancel(); onProgress(progress); },
        cancelSignal: cancelSignal ?? cancellation.cancelSignal });
      metrics.slowestFrames = result.slowestFrames;
      metrics.captureMs = Date.now() - captureAt;
      metrics.captureFps = metrics.captureMs > 0 ? Number((props.frames / (metrics.captureMs / 1000)).toFixed(2)) : 0;
    } finally { clearTimeout(timeout); }
  } finally { await browser?.close({ silent: true }); await new Promise(done => server.close(done)); }
  return metrics;
}
