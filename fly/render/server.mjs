// Worker goatlab-render: voz + pool de fotos -> MP4 -> sendVideo por Telegram.
// Remotion interpreta el plan por audio. FFmpeg normaliza y mezcla la voz.
// Durable: POST /render encola un job; GET /jobs/:id recupera su estado.
// El gateway manda un POST por audio apenas llega; la cola renderiza de a uno
// y avisa al chat si un Short falla. Node 22. Sin OpenMontage y sin Rust.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { FRAME_W, FRAME_H } from '../../src/lib/short-format.js';
import { ASSETS_PER_MATCH } from '../../src/lib/media.js';
import { audioFailureText } from '../../src/lib/render-queue.js';
import { telegramCaption } from '../../src/lib/youtube.js';
import { JobStore } from './job-store.mjs';
import { RemoteLedger } from './remote-ledger.mjs';
import { warmPhotos, prunePhotoCache, pinPhotos } from './photo-cache.mjs';
import { pruneClipCache } from './clip-cache.mjs';
import { prepareShort, renderSilent, muxVoice, mediaDuration } from './short-job.mjs';

const run = promisify(execFile);
const PORT = Number(process.env.PORT ?? 3000);
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.RENDER_SECRET;
const MAX_MB = 45; // sendVideo permite 50MB: margen de seguridad

if (!BOT) throw new Error('falta TELEGRAM_BOT_TOKEN');
if (!SECRET) throw new Error('falta RENDER_SECRET');

const stateDir=process.env.RENDER_STATE_DIR || '/data/render-jobs';
const ledger=process.env.RENDER_LEDGER_URL ? new RemoteLedger(process.env.RENDER_LEDGER_URL, SECRET) : undefined;
if(ledger) await ledger.restore(stateDir);
const store = new JobStore(stateDir, { ledger });
const jobs = store.jobs;
const cacheDir = process.env.PHOTO_CACHE_DIR || '/data/photo-cache';
let tail = Promise.resolve(); // una sola captura activa
const IDLE_MS = 15 * 60_000;
let lastWork = Date.now();
let inflight = 0;
const protectedIds = new Set();
function cleanup() {
  store.cleanup(protectedIds);
  pruneClipCache(join(cacheDir, '../clip-cache'), { protectedUrls: [...jobs.values()].flatMap(j => j.clips ?? []).map(c => c.url), purgeUnused: true });
  prunePhotoCache(cacheDir, { protectedUrls: [...jobs.values()].flatMap(j => j.assets ?? []).map(a => a.url), purgeUnused: true });
}
setInterval(cleanup, 300_000).unref();

const tg = (method, body) =>
  fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const j = await r.json();
    if (!j.ok) throw new Error(`telegram ${method}: ${j.description ?? r.status}`);
    return j.result;
  });

async function download(url, file) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`descarga HTTP ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length > 30 * 1024 * 1024) throw new Error('audio demasiado grande');
  writeFileSync(`${file}.tmp`, bytes);
  renameSync(`${file}.tmp`, file);
}

async function sendVideo(chatId, file, cap) {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  form.set('video', new Blob([readFileSync(file)], { type: 'video/mp4' }), 'short.mp4');
  form.set('caption', cap);
  form.set('supports_streaming', 'true');
  const r = await fetch(`https://api.telegram.org/bot${BOT}/sendVideo`, {
    method: 'POST',
    signal: AbortSignal.timeout(120_000),
    body: form,
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`telegram sendVideo: ${j.description ?? r.status}`);
  return j.result.message_id;
}

function stopIfCancelled(job, log) {
  if (!job.cancelled) return false;
  job.status = 'cancelled';
  store.save(job);
  log('cancelado');
  return true;
}

async function runJob(job) {
  const tmp = store.directory(job);
  const log = (msg) => console.log(`render: ${job.id} ${msg}`);
  const started = Date.now();
  if (stopIfCancelled(job, log)) return;
  mkdirSync(tmp, { recursive: true });
  const onStage = async (name, elapsed) => {
    job.currentStage=name;
    if(elapsed !== undefined) job.stages[name]=elapsed;
    else { job.stageStartedAt=Date.now(); log(`etapa ${name}`); }
    store.save(job); await store.flush();
  };
  const measure = async (name, fn) => { const at = Date.now(); await onStage(name); try { return await fn(); } finally { await onStage(name, Date.now()-at); } };
  try {
    if (job.assets.some(asset => asset.source !== 'agnes')) throw new Error('El banco contiene imágenes externas; inicia una serie nueva con /start.');
    // 1. Voz: desde Telegram (file_id) o URL directa (pruebas).
    const voiceFile = join(tmp, 'voice.ogg');
    await measure('voiceDownload', async () => {
      if (existsSync(voiceFile)) return;
      if (job.audioFileId) {
        const f = await tg('getFile', { file_id: job.audioFileId });
        await download(`https://api.telegram.org/file/bot${BOT}/${f.file_path}`, voiceFile);
      } else await download(job.audioUrl, voiceFile);
    });
    if (stopIfCancelled(job, log)) return;
    const voiceSeconds = await mediaDuration(voiceFile);

    // 2. La transcripción ordena el pool y es el texto del video.
    const { total, provider, stages, plan, voiceFile: adjustedVoiceFile, voiceRate, originalVoiceSeconds } = await measure('preparation', () => prepareShort({
      tmp,
      voiceFile,
      voiceSeconds,
      assets: job.assets, clips: job.clips ?? [], motionPrompts: job.motionPrompts ?? [],
      variant: job.variant,
      home: job.home,
      away: job.away,
      matchLabel: job.matchLabel,
      log, cacheDir,
      facts: job.facts ?? [], mediaMinimum: job.mediaMinimum ?? 2, requestId: job.requestId ?? job.id, onStage,
    }));
    Object.assign(job.stages, stages);
    job.renderEngine = 'remotion';
    job.voiceRate = voiceRate; job.originalVoiceSeconds = originalVoiceSeconds;
    job.planModel = plan.model;
    job.planningFallback = Boolean(plan.fallback);
    store.save(job);
    job.timing = provider;
    const silent = join(tmp, 'silent.mp4');
    const out = join(tmp, 'short.mp4');
    if (stopIfCancelled(job, log)) return;
    await measure('capture', () => renderSilent(tmp, silent, { isCancelled: () => job.cancelled || job.expiresAt <= Date.now() }));
    if (stopIfCancelled(job, log)) return;
    await measure('mux', () => muxVoice({ silent, voiceFile: adjustedVoiceFile, total, out }));

    // 3. Verificación: 1080x1920, duración ≈ plan, peso < 45MB.
    const probe = JSON.parse(
      (await run('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', out])).stdout,
    );
    const v = probe.streams.find((s) => s.codec_type === 'video');
    if (!v || v.width !== FRAME_W || v.height !== FRAME_H)
      throw new Error(`video inesperado: ${v?.width}x${v?.height}`);
    const [numerator, denominator] = String(v.avg_frame_rate).split('/').map(Number);
    if (Math.abs(numerator / denominator - 30) > .01 || v.codec_name !== 'h264' || !probe.streams.some(s => s.codec_type === 'audio' && s.codec_name === 'aac'))
      throw new Error('se requiere H.264 a 30 fps y audio AAC');
    const dur = await mediaDuration(out);
    if (dur >= 50 || Math.abs(dur - total) > .1) throw new Error(`duración ${dur}s ≠ ${total}s`);
    const sizeMb = statSync(out).size / 1_000_000;
    if (sizeMb >= MAX_MB) throw new Error(`MP4 de ${sizeMb.toFixed(1)}MB alcanza el límite de ${MAX_MB}MB`);

    // 4. Envío. Un reemplazo del último audio llega a cancelar antes de publicarlo.
    if (stopIfCancelled(job, log)) return;
    job.status = 'delivering';
    store.save(job);
    await store.flush();
    const musicCredit = readFileSync(new URL('./assets/bed.txt', import.meta.url), 'utf8');
    const messageId = await measure('delivery', () => sendVideo(job.chatId, out, telegramCaption({ ...job, musicCredit })));
    const seconds = Math.round((Date.now() - started) / 1000);
    Object.assign(job, { status: 'done', messageId, duration: dur, sizeMb, seconds });
    job.currentStage='done';
    store.save(job);
    rmSync(tmp, { recursive: true, force: true });
    const credits = [musicCredit.trim(), String(job.attribution ?? '').trim()].filter(Boolean).join('\n');
    if ([String(job.title ?? '').slice(0, 220), String(job.hook ?? ''), credits].join('\n').length > 1024) {
      const form = new FormData();
      form.set('chat_id', String(job.chatId));
      form.set('document', new Blob([credits], { type: 'text/plain' }), 'goatlab-creditos.txt');
      try {
        const response = await fetch(`https://api.telegram.org/bot${BOT}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
        const result = await response.json();
        if (!result.ok) throw new Error('créditos no entregados');
        job.creditsMessageId = result.result.message_id;
      } catch { job.creditsError = 'Reenviar los créditos completos desde el registro del trabajo.'; log(job.creditsError); }
      store.save(job);
    }
    log(`done (${dur.toFixed(1)}s, ${sizeMb.toFixed(1)}MB, tiempos ${provider}, ${seconds}s de render, msg ${messageId})`);
  } catch (e) {
    Object.assign(job, { status: job.status === 'delivering' ? 'delivery-unknown' : job.cancelled ? 'cancelled' : 'error', error: String(e.message ?? e).slice(0, 500), errorCode: e.code ?? null });
    store.save(job);
    log(`error: ${job.error}`);
    if (job.cancelled) return;
    await tg('sendMessage', {
      chat_id: job.chatId,
      text: job.status === 'delivery-unknown' ? `El envío del video ${job.variant + 1} no quedó confirmado. Se conserva el MP4; no se reenviará automáticamente.` : audioFailureText(job.variant + 1, job.error),
    }).catch((err) => log(`aviso al chat falló: ${err.message}`));
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => {
      chunks.push(c);
      if (chunks.reduce((n, x) => n + x.length, 0) > 1024 * 1024) reject(new Error('body > 1MB'));
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function schedule(job) {
  inflight++;
  protectedIds.add(job.id);
  lastWork = Date.now();
  // Pre-download future media while the current job captures frames. Cache limits concurrency globally.
  const allowedAssets = job.assets.filter(asset => asset.source === 'agnes');
  const unpin = pinPhotos(allowedAssets);
  const warming = warmPhotos(allowedAssets, cacheDir).catch(() => {});
  tail = tail.then(async () => {
    await warming;
    if (job.expiresAt <= Date.now()) job.cancelled = true;
    if (job.cancelled) { job.status = 'cancelled'; return; }
    job.status = 'working';
    store.save(job);
    await runJob(job);
  }).catch(() => {
    job.status = 'error'; job.error = 'No se pudo iniciar el trabajo'; store.save(job);
  }).finally(async () => { unpin(); store.release(job); try { await store.flush(); } catch { console.error('render: registro remoto pendiente; no reenviar entregas inciertas'); } protectedIds.delete(job.id); inflight--; lastWork = Date.now(); cleanup(); });
}

const server = createServer(async (req, res) => {
  const json = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  try {
    if (req.url === '/healthz') return json(200, { ok: true, workflowProtocol: 2, revision: process.env.GOATLAB_REVISION ?? 'unknown', editPlanVersion: 4, renderEngine: 'remotion', maxSeconds: 49.9 });
    const m = req.url?.match(/^\/jobs\/([\w-]+)$/);
    if (req.method === 'GET' && m) {
      if (req.headers.authorization !== `Bearer ${SECRET}`) return json(401, { error: 'no autorizado' });
      cleanup();
      const job = jobs.get(m[1]);
      if (job) lastWork = Date.now();
      return job ? json(200, job) : json(404, { error: 'job inexistente' });
    }
    if (req.method === 'POST' && req.url === '/render/cancel') {
      if (req.headers.authorization !== `Bearer ${SECRET}`) return json(401, { error: 'no autorizado' });
      const b = JSON.parse(await readBody(req));
      if (!b.chatId || !b.matchId || (!b.requestId && !b.audioFileId && !b.audioUrl)) return json(400, { error: 'cancelación incompleta' });
      const cancelled = store.cancel(b);
      for (const job of jobs.values()) if (job.status === "cancelled" && !protectedIds.has(job.id)) store.release(job);
      cleanup();
      await store.flush();
      return json(200, { cancelled });
    }
    if (req.method === 'POST' && req.url === '/render') {
      if (req.headers.authorization !== `Bearer ${SECRET}`) return json(401, { error: 'no autorizado' });
      const b = JSON.parse(await readBody(req));
      if (!Number.isFinite(b.expiresAt) || b.expiresAt > Date.now()+86400_000) return json(400, { error: 'expiresAt inválido' });
      if (b.expiresAt <= Date.now()) return json(410, { error: 'solicitud caducada' });
      cleanup();
      for (const k of ['chatId', 'matchId', 'matchLabel', 'hook', 'assets']) {
        if (b[k] == null || b[k] === '') return json(400, { error: `falta ${k}` });
      }
      if (!b.audioFileId && !b.audioUrl) return json(400, { error: 'falta audioFileId o audioUrl' });
      if (!/^-?[1-9][0-9]{0,19}$/.test(String(b.chatId))) return json(400, { error: 'chatId debe ser el identificador numérico de Telegram' });
      if (b.audioFileId && !/^[A-Za-z0-9_-]{16,256}$/.test(b.audioFileId)) return json(400, { error: 'audioFileId no admite rutas locales' });
      if (!Array.isArray(b.assets) || b.assets.length > ASSETS_PER_MATCH) return json(400, { error: 'fotos insuficientes' });
      const mediaMinimum = b.mediaMinimum ?? 2;
      if (![0, 1, 2, 8].includes(mediaMinimum) || b.assets.length < mediaMinimum) return json(400, { error: 'mínimo de fotos inválido' });
      if (b.facts != null && (!Array.isArray(b.facts) || b.facts.length > 128 || b.facts.some(f => !f || typeof f.id !== 'string' || typeof f.label !== 'string' || !Number.isFinite(f.value) || f.value < 0 || typeof f.unit !== 'string' || typeof f.source !== 'string'))) return json(400, { error: 'hechos inválidos' });
      if (b.clips != null && (!Array.isArray(b.clips) || b.clips.length > 3 || b.clips.some(c => c?.source !== 'agnes' || typeof c.url !== 'string' || !/^https:\/\//.test(c.url) || !Number.isFinite(c.duration) || c.duration < 4 || c.duration > 12.5))) return json(400, { error: 'clips inválidos' });
      if (b.motionPrompts != null && (!Array.isArray(b.motionPrompts) || b.motionPrompts.length > 5 || b.motionPrompts.some(p => !Number.isInteger(p?.n) || p.n < 1 || p.n > 5 || !['form','goals','clean-sheets','head-to-head','synthesis'].includes(p.kind) || typeof p?.prompt !== 'string' || p.prompt.length > 12000 || !Array.isArray(p.factIds) || p.factIds.some(id => !(b.facts ?? []).some(f => f.id === id))))) return json(400, { error: 'motion prompts inválidos' });
      const variant = Number(b.variant ?? 0);
      if (!Number.isInteger(variant) || variant < 0 || variant > 9) return json(400, { error: 'variant fuera de rango' });
      if (b.requestId && (typeof b.requestId !== 'string' || b.requestId.length > 128)) return json(400, { error: 'requestId inválido' });
      for (const asset of b.assets) if (asset?.source !== 'agnes' || !asset?.url || !/^https:\/\//.test(asset.url)) return json(400, { error: 'Solo se admiten imágenes generadas con Agnes' });
      const { job, duplicate } = store.accept({
        expiresAt: b.expiresAt, chatId: b.chatId, matchId: b.matchId, requestId: b.requestId, seriesId: b.seriesId,
        variant, matchLabel: b.matchLabel, title: String(b.title ?? ''), hook: b.hook,
        home: String(b.home ?? ''), away: String(b.away ?? ''),
        renderEngine: 'remotion', audioFileId: b.audioFileId, audioUrl: b.audioUrl, attribution: String(b.attribution ?? ''),
        clips: b.clips ?? [], motionPrompts: b.motionPrompts ?? [], assets: b.assets.slice(0, ASSETS_PER_MATCH), facts: b.facts ?? [], mediaMinimum,
      });
      await store.flush();
      if (job.status === 'queued' && !protectedIds.has(job.id)) schedule(job);
      return json(202, { jobId: job.id, duplicate, status: job.status });
    }
    return json(404, { error: 'desconocido' });
  } catch (e) {
    return json(400, { error: String(e.message ?? e).slice(0, 200) });
  }
});

for (const job of jobs.values()) if (["done", "cancelled"].includes(job.status)) store.release(job);
cleanup();
await store.flush();
for (const job of store.pending()) schedule(job);

server.listen(PORT, () => console.log(`render: http://localhost:${server.address().port}`));

// El proxy no logra completar el autostop. Salir con 0 deja la máquina
// stopped (restart on-failure) y el siguiente request la vuelve a encender.
setInterval(() => {
  if (inflight > 0 || Date.now() - lastWork < IDLE_MS) return;
  console.log('render: 15 min sin jobs, apagando');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}, 30_000).unref();
