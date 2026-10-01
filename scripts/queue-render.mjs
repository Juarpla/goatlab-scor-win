/** Publica el render del audio, o lo deja en espera si las fotos no están.
 *  Uso: node scripts/queue-render.mjs --match=<id> --variant=<k-1> --chat=<chatId> --audio=<fileId>
 *  Escribe `ok` o `pending` en stdout. */
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pendingRecord, queueDecision, renderRequest } from '../src/lib/render-queue.js';

const args = new Map(process.argv.slice(2).map(a => {
  const i = a.indexOf('=');
  return i === -1 ? [a, ''] : [a.slice(0, i), a.slice(i + 1)];
}));
const matchId = args.get('--match');
const variant = Number(args.get('--variant'));
const chatId = args.get('--chat');
const audioFileId = args.get('--audio');
const out = args.get('--out') || process.env.MEDIA_PACK_DIR || '/data/media-pack';
const scriptsDir = args.get('--scripts') || 'public/data/youtube-scripts';
const workerUrl = (process.env.WORKER_URL || 'https://goatlab-render.fly.dev').replace(/\/$/, '');

if (!matchId || !chatId || !audioFileId || !Number.isInteger(variant) || variant < 0) {
  console.error('queue-render: faltan --match, --variant, --chat o --audio');
  process.exit(1);
}

const readyPath = join(out, `${matchId}.ready`);
const manifestPath = join(out, `${matchId}.json`);
const pendingPath = join(dirname(out), 'pending', matchId, `${variant}.json`);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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

let script;
try {
  script = JSON.parse(await readFile(join(scriptsDir, `${matchId}.json`), 'utf8'));
} catch {
  console.error(`queue-render: sin guion ${matchId}`);
  process.exit(1);
}

const record = pendingRecord({ chatId, matchId, variant, audioFileId, script });
let ready = await exists(readyPath);
let manifest = null;
if (ready) {
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    ready = false;
  }
}
let request = ready ? renderRequest(record, manifest) : null;
if (queueDecision({ ready, request }) === 'post') {
  await postRender(request);
  await rm(pendingPath, { force: true });
  console.log('ok');
  process.exit(0);
}

await mkdir(dirname(pendingPath), { recursive: true });
await writeFile(pendingPath, JSON.stringify(record));

// El job pudo terminar justo ahora. Un POST repetido devuelve el mismo trabajo.
if (await exists(readyPath)) {
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    request = renderRequest(record, manifest);
    if (request) {
      await postRender(request);
      await rm(pendingPath, { force: true });
      console.log('ok');
      process.exit(0);
    }
  } catch (error) {
    console.error(`queue-render: ${error.message}`);
    process.exit(1);
  }
}
console.log('pending');
