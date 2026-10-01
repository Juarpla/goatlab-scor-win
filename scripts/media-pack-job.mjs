/** Busca las fotos en segundo plano, avisa por Telegram y publica los renders en espera.
 *  Uso: node scripts/media-pack-job.mjs --match=<id> --chat=<chatId> --out=/data/media-pack */
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { photoFailureText, renderRequest } from '../src/lib/render-queue.js';

const args = new Map(process.argv.slice(2).map(a => {
  const i = a.indexOf('=');
  return i === -1 ? [a, ''] : [a.slice(0, i), a.slice(i + 1)];
}));
const matchId = args.get('--match');
const chatId = args.get('--chat');
const out = args.get('--out') || process.env.MEDIA_PACK_DIR || '/data/media-pack';
const workerUrl = (process.env.WORKER_URL || 'https://goatlab-render.fly.dev').replace(/\/$/, '');
const here = dirname(fileURLToPath(import.meta.url));

if (!matchId) {
  console.error('media-job: falta --match');
  process.exit(1);
}

const running = join(out, `${matchId}.running`);
const ready = join(out, `${matchId}.ready`);
const failed = join(out, `${matchId}.failed`);
const logFile = join(out, `${matchId}.log`);
const pendingDir = join(dirname(out), 'pending', matchId);

async function notify(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !chatId) {
    console.log(`media-job: ${text}`);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 3500) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) console.error(`media-job: telegram HTTP ${res.status}`);
}

async function postRender(body) {
  const res = await fetch(`${workerUrl}/render`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RENDER_SECRET ?? ''}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`render HTTP ${res.status}`);
}

async function flush(manifest) {
  let files = [];
  try {
    files = (await readdir(pendingDir)).filter(name => name.endsWith('.json'));
  } catch {
    return 0;
  }
  let posted = 0;
  for (const name of files) {
    const path = join(pendingDir, name);
    let record;
    try {
      record = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      continue;
    }
    const request = renderRequest(record, manifest);
    if (!request) continue;
    try {
      await postRender(request);
      await rm(path, { force: true });
      posted += 1;
    } catch (error) {
      console.error(`media-job: pendiente ${name}: ${error.message}`);
    }
  }
  return posted;
}

await mkdir(out, { recursive: true });
await rm(ready, { force: true });
await rm(failed, { force: true });
await writeFile(running, new Date().toISOString());

let log = '';
let code = 1;
try {
  const child = spawn(process.execPath, [
    join(here, 'generate-media-pack.mjs'),
    `--match=${matchId}`,
    `--out=${out}`,
  ], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  await writeFile(logFile, log);
  if (code !== 0) throw new Error(photoFailureText(log) || `salida ${code}`);
  const manifest = JSON.parse(await readFile(join(out, `${matchId}.json`), 'utf8'));
  await writeFile(ready, new Date().toISOString());
  const posted = await flush(manifest);
  const count = Array.isArray(manifest.assets) ? manifest.assets.length : 0;
  await notify(`📸 Fotos listas (${count} fotos). ${posted ? `Renderizo ${posted} audios en espera.` : 'Ya puedes seguir mandando audios.'}`);
} catch (error) {
  const text = photoFailureText(log) || error.message;
  await writeFile(failed, text).catch(() => {});
  await notify(`❌ Fotos: ${text}`);
  code = 1;
} finally {
  await rm(running, { force: true });
}
process.exit(code === 0 ? 0 : 1);
