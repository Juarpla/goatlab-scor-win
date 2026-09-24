// Worker goatlab-render: voz + partido -> MP4 -> sendVideo por Telegram.
// Stateless: POST /render encola un job (202 {jobId}), GET /jobs/:id sondea,
// al terminar el MP4 se envía solo al chat y el temporal se borra.
// Sin footage, sin logos de equipos/ligas, sin cuotas (ver COMPLIANCE.md).
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  ACCENT,
  buildFilterGraph,
  buildShortPlan,
  logoPng,
  textPng,
  XFADE_SECONDS,
} from '../../src/lib/short.js';

const run = promisify(execFile);
const PORT = Number(process.env.PORT ?? 3000);
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.RENDER_SECRET;
const LEAD_SECONDS = 0.5; // la voz entra a los 0.5s
const MAX_MB = 45; // sendVideo permite 50MB: margen de seguridad
const MIN_VOICE = 5; // segundos mínimos de voz aceptados
const MAX_VOICE = 120; // segundos máximos de voz aceptados
const DISCLAIMER =
  'Análisis con fines educativos e informativos. No es asesoría de apuestas y no garantiza resultados.';

if (!BOT) throw new Error('falta TELEGRAM_BOT_TOKEN');
if (!SECRET) throw new Error('falta RENDER_SECRET');

const jobs = new Map();
let seq = 0;
let tail = Promise.resolve(); // un render a la vez

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

async function voiceDuration(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]);
  return Number(stdout.trim());
}

function caption({ matchLabel, hook, matchId }) {
  return (
    `${matchLabel}\n${hook}\n` +
    `🔗 Más data: https://goatlab.win/partido/${matchId}\n#goatlab #futbol\n${DISCLAIMER}`
  ).slice(0, 1000);
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

async function runJob(job) {
  const tmp = join(tmpdir(), `goatlab-render-${job.id}`);
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
    const voiceSeconds = await voiceDuration(voiceFile);
    if (!(voiceSeconds >= MIN_VOICE && voiceSeconds <= MAX_VOICE))
      throw new Error(`voz de ${voiceSeconds.toFixed(1)}s fuera de rango (${MIN_VOICE}-${MAX_VOICE}s)`);

    // 2. Plan dinámico: las fotos cubren la voz + lead + tail, endcard 3s.
    const photosSeconds = voiceSeconds + LEAD_SECONDS * 2;
    const segSeconds = (photosSeconds + 2 * XFADE_SECONDS) / job.photos.length;
    const plan = buildShortPlan({
      script: { matchId: job.matchId, scripts: [{ hook: job.hook }] },
      media: {
        match: job.matchLabel,
        assets: job.photos.map((url) => ({ url })),
      },
      segSeconds,
    });
    const total = plan.totalSeconds;

    // 3. Fotos a temporal.
    const imgs = [];
    for (const [i, s] of plan.segments.entries()) {
      const f = join(tmp, `${i}.jpg`);
      await download(s.asset.url, f);
      imgs.push(f);
    }

    // 4. ffmpeg: video como en F4 + voz con adelay/loudnorm recortada al total.
    const brandIdx = plan.segments.length;
    const overlays = [
      logoPng(),
      textPng({ text: plan.brand, fontSize: 64, color: ACCENT }),
      textPng({ text: plan.brand, fontSize: 110, color: ACCENT }),
      textPng({ text: plan.match, fontSize: 44, color: '#ffffff' }),
    ];
    const graph =
      buildFilterGraph(plan, {
        logo: brandIdx,
        bottom: brandIdx + 1,
        endMain: brandIdx + 2,
        endSub: brandIdx + 3,
      }) +
      `;[${brandIdx + overlays.length}:a]aresample=44100,aformat=channel_layouts=stereo,` +
      `adelay=${LEAD_SECONDS * 1000}|${LEAD_SECONDS * 1000},` +
      `loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=0:${total}[aout]`;
    const looped = (f, t) => ['-loop', '1', '-framerate', String(plan.fps), '-t', String(t), '-i', f];
    const out = join(tmp, 'short.mp4');
    const ff = [
      '-y',
      ...imgs.flatMap((f) => looped(f, plan.segments[0].seconds)),
      ...overlays.flatMap((f) => looped(f, total)),
      '-i', voiceFile,
      '-filter_complex', graph,
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      out,
    ];
    try {
      await run('ffmpeg', ff, { timeout: 15 * 60 * 1000 });
    } catch (e) {
      throw new Error(`ffmpeg: ${(e.stderr ?? e.message).split('\n').slice(-15).join('\n')}`);
    }

    // 5. Verificación: 1080x1920, duración ≈ plan, peso < 45MB.
    const probe = JSON.parse(
      (await run('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', out])).stdout,
    );
    const v = probe.streams.find((s) => s.codec_type === 'video');
    if (!v || v.width !== plan.width || v.height !== plan.height)
      throw new Error(`video inesperado: ${v?.width}x${v?.height}`);
    const { stdout: d } = await run('ffprobe', [
      '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', out,
    ]);
    const dur = Number(d.trim());
    if (Math.abs(dur - total) > 1.5) throw new Error(`duración ${dur}s ≠ ${total}s`);
    const sizeMb = statSync(out).size / 1024 / 1024;
    if (sizeMb > MAX_MB) throw new Error(`MP4 de ${sizeMb.toFixed(1)}MB supera ${MAX_MB}MB`);

    // 6. Envío y limpieza.
    const messageId = await sendVideo(job.chatId, out, caption(job));
    Object.assign(job, { status: 'done', messageId, duration: dur, sizeMb });
    console.log(`render: ${job.id} done (${dur.toFixed(1)}s, ${sizeMb.toFixed(1)}MB, msg ${messageId})`);
  } catch (e) {
    Object.assign(job, { status: 'error', error: String(e.message ?? e).slice(0, 500) });
    console.log(`render: ${job.id} error: ${job.error}`);
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
      return job ? json(200, job) : json(404, { error: 'job inexistente' });
    }
    if (req.method === 'POST' && req.url === '/render') {
      if (req.headers.authorization !== `Bearer ${SECRET}`) return json(401, { error: 'no autorizado' });
      const b = JSON.parse(await readBody(req));
      for (const k of ['chatId', 'matchId', 'matchLabel', 'hook', 'photos']) {
        if (b[k] == null || b[k] === '') return json(400, { error: `falta ${k}` });
      }
      if (!b.audioFileId && !b.audioUrl) return json(400, { error: 'falta audioFileId o audioUrl' });
      if (!Array.isArray(b.photos) || b.photos.length < 1) return json(400, { error: 'photos vacío' });
      const id = `job-${Date.now().toString(36)}-${seq++}`;
      const job = {
        id,
        status: 'queued',
        chatId: b.chatId,
        matchId: b.matchId,
        variant: b.variant ?? 0,
        matchLabel: b.matchLabel,
        hook: b.hook,
        audioFileId: b.audioFileId,
        audioUrl: b.audioUrl,
        photos: b.photos.slice(0, 5),
      };
      jobs.set(id, job);
      tail = tail.then(() => {
        job.status = 'working';
        return runJob(job);
      });
      return json(202, { jobId: id });
    }
    return json(404, { error: 'desconocido' });
  } catch (e) {
    return json(400, { error: String(e.message ?? e).slice(0, 200) });
  }
});

server.listen(PORT, () => console.log(`render: http://localhost:${PORT}`));
