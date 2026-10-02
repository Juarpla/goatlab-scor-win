// Worker goatlab-render: voz + pool de fotos -> MP4 -> sendVideo por Telegram.
// HyperFrames (plantilla fija) pinta el 9:16. FFmpeg mezcla la voz.
// Stateless: POST /render encola un job (202 {jobId}), GET /jobs/:id sondea.
// El gateway manda un POST por audio apenas llega; la cola renderiza de a uno
// y avisa al chat si un Short falla. Node 22. Sin OpenMontage y sin Rust.
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { FRAME_W, FRAME_H } from '../../src/lib/hyperframe.js';
import { ASSETS_PER_MATCH } from '../../src/lib/media.js';
import { audioFailureText } from '../../src/lib/render-queue.js';
import { telegramCaption } from '../../src/lib/youtube.js';
import { prepareShort, renderSilent, muxVoice, mediaDuration } from './short-job.mjs';

const run = promisify(execFile);
const PORT = Number(process.env.PORT ?? 3000);
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.RENDER_SECRET;
const MAX_MB = 45; // sendVideo permite 50MB: margen de seguridad
const MIN_VOICE = 5; // segundos mínimos de voz aceptados
const MAX_VOICE = 120; // segundos máximos de voz aceptados

if (!BOT) throw new Error('falta TELEGRAM_BOT_TOKEN');
if (!SECRET) throw new Error('falta RENDER_SECRET');

const jobs = new Map();
const byKey = new Map(); // chatId:matchId:variant:audio -> jobId
let seq = 0;
let tail = Promise.resolve(); // un render a la vez
const IDLE_MS = 15 * 60_000;
let lastWork = Date.now();
let inflight = 0;

const tg = (method, body) =>
  fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const j = await r.json();
    if (!j.ok) throw new Error(`telegram ${method}: ${j.description ?? r.status}`);
    return j.result;
  });

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`descarga HTTP ${r.status}: ${url.slice(0, 80)}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

async function sendVideo(chatId, file, cap) {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  form.set('video', new Blob([readFileSync(file)], { type: 'video/mp4' }), 'short.mp4');
  form.set('caption', cap);
  form.set('supports_streaming', 'true');
  const r = await fetch(`https://api.telegram.org/bot${BOT}/sendVideo`, {
    method: 'POST',
    body: form,
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`telegram sendVideo: ${j.description ?? r.status}`);
  return j.result.message_id;
}

function stopIfCancelled(job, log) {
  if (!job.cancelled) return false;
  job.status = 'cancelled';
  log('cancelado');
  return true;
}

async function runJob(job) {
  const tmp = join(tmpdir(), `goatlab-render-${job.id}`);
  const log = (msg) => console.log(`render: ${job.id} ${msg}`);
  const started = Date.now();
  if (stopIfCancelled(job, log)) return;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try {
    // 1. Voz: desde Telegram (file_id) o URL directa (pruebas).
    const voiceFile = join(tmp, 'voice.ogg');
    if (job.audioFileId) {
      const f = await tg('getFile', { file_id: job.audioFileId });
      await download(`https://api.telegram.org/file/bot${BOT}/${f.file_path}`, voiceFile);
    } else {
      await download(job.audioUrl, voiceFile);
    }
    const voiceSeconds = await mediaDuration(voiceFile);
    if (!(voiceSeconds >= MIN_VOICE && voiceSeconds <= MAX_VOICE))
      throw new Error(`voz de ${voiceSeconds.toFixed(1)}s fuera de rango (${MIN_VOICE}-${MAX_VOICE}s)`);

    // 2. La transcripción ordena el pool y es el texto del video.
    const { total, provider } = await prepareShort({
      tmp,
      voiceFile,
      voiceSeconds,
      assets: job.assets,
      variant: job.variant,
      home: job.home,
      away: job.away,
      matchLabel: job.matchLabel,
      log,
    });
    job.timing = provider;
    const silent = join(tmp, 'silent.mp4');
    const out = join(tmp, 'short.mp4');
    await renderSilent(tmp, silent);
    await muxVoice({ silent, voiceFile, total, out });

    // 3. Verificación: 1080x1920, duración ≈ plan, peso < 45MB.
    const probe = JSON.parse(
      (await run('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', out])).stdout,
    );
    const v = probe.streams.find((s) => s.codec_type === 'video');
    if (!v || v.width !== FRAME_W || v.height !== FRAME_H)
      throw new Error(`video inesperado: ${v?.width}x${v?.height}`);
    const dur = await mediaDuration(out);
    if (Math.abs(dur - total) > 1.5) throw new Error(`duración ${dur}s ≠ ${total}s`);
    const sizeMb = statSync(out).size / 1024 / 1024;
    if (sizeMb > MAX_MB) throw new Error(`MP4 de ${sizeMb.toFixed(1)}MB supera ${MAX_MB}MB`);

    // 4. Envío. Un reemplazo del último audio llega a cancelar antes de publicarlo.
    if (stopIfCancelled(job, log)) return;
    const messageId = await sendVideo(job.chatId, out, telegramCaption(job));
    const seconds = Math.round((Date.now() - started) / 1000);
    Object.assign(job, { status: 'done', messageId, duration: dur, sizeMb, seconds });
    log(`done (${dur.toFixed(1)}s, ${sizeMb.toFixed(1)}MB, tiempos ${provider}, ${seconds}s de render, msg ${messageId})`);
  } catch (e) {
    Object.assign(job, { status: 'error', error: String(e.message ?? e).slice(0, 500) });
    log(`error: ${job.error}`);
    if (job.cancelled) return;
    await tg('sendMessage', {
      chat_id: job.chatId,
      text: audioFailureText(job.variant + 1, job.error),
    }).catch((err) => log(`aviso al chat falló: ${err.message}`));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
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

const server = createServer(async (req, res) => {
  const json = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  try {
    if (req.url === '/healthz') return json(200, { ok: true });
    const m = req.url?.match(/^\/jobs\/([\w-]+)$/);
    if (req.method === 'GET' && m) {
      const job = jobs.get(m[1]);
      if (job) lastWork = Date.now();
      return job ? json(200, job) : json(404, { error: 'job inexistente' });
    }
    if (req.method === 'POST' && req.url === '/render/cancel') {
      if (req.headers.authorization !== `Bearer ${SECRET}`) return json(401, { error: 'no autorizado' });
      const b = JSON.parse(await readBody(req));
      const key = [b.chatId, b.matchId, Number(b.variant ?? 0), b.audioFileId ?? b.audioUrl].join(':');
      const job = jobs.get(byKey.get(key));
      if (!job || job.status === 'done' || job.status === 'cancelled') return json(200, { cancelled: false });
      job.cancelled = true;
      if (job.status === 'queued') job.status = 'cancelled';
      return json(200, { cancelled: true });
    }
    if (req.method === 'POST' && req.url === '/render') {
      if (req.headers.authorization !== `Bearer ${SECRET}`) return json(401, { error: 'no autorizado' });
      const b = JSON.parse(await readBody(req));
      for (const k of ['chatId', 'matchId', 'matchLabel', 'hook', 'assets']) {
        if (b[k] == null || b[k] === '') return json(400, { error: `falta ${k}` });
      }
      if (!b.audioFileId && !b.audioUrl) return json(400, { error: 'falta audioFileId o audioUrl' });
      if (!Array.isArray(b.assets) || b.assets.filter(asset => asset?.url).length < 2) return json(400, { error: 'fotos insuficientes' });
      const variant = Number(b.variant ?? 0);
      const key = [b.chatId, b.matchId, variant, b.audioFileId ?? b.audioUrl].join(':');
      const prior = jobs.get(byKey.get(key));
      if (prior && prior.status !== 'error') return json(202, { jobId: prior.id, duplicate: true });
      const id = `job-${Date.now().toString(36)}-${seq++}`;
      const job = {
        id,
        status: 'queued',
        chatId: b.chatId,
        matchId: b.matchId,
        variant,
        matchLabel: b.matchLabel,
        title: String(b.title ?? ''),
        hook: b.hook,
        home: String(b.home ?? ''),
        away: String(b.away ?? ''),
        audioFileId: b.audioFileId,
        audioUrl: b.audioUrl,
        assets: b.assets.slice(0, ASSETS_PER_MATCH).map(asset => ({
          url: asset.url,
          subject: asset.subject ?? null,
          motive: asset.motive ?? null,
          query: asset.query ?? '',
        })),
      };
      jobs.set(id, job);
      byKey.set(key, id);
      inflight++;
      lastWork = Date.now();
      tail = tail.then(() => {
        job.status = 'working';
        return runJob(job);
      }).finally(() => {
        inflight--;
        lastWork = Date.now();
      });
      return json(202, { jobId: id });
    }
    return json(404, { error: 'desconocido' });
  } catch (e) {
    return json(400, { error: String(e.message ?? e).slice(0, 200) });
  }
});

server.listen(PORT, () => console.log(`render: http://localhost:${PORT}`));

// El proxy no logra completar el autostop. Salir con 0 deja la máquina
// stopped (restart on-failure) y el siguiente request la vuelve a encender.
setInterval(() => {
  if (inflight > 0 || Date.now() - lastWork < IDLE_MS) return;
  console.log('render: 15 min sin jobs, apagando');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}, 30_000).unref();
