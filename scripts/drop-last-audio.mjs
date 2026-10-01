/** Tira el último audio: borra el pendiente y cancela el render si ya se publicó.
 *  Uso: node scripts/drop-last-audio.mjs --match=<id> --variant=<k-1> --chat=<chatId> --audio=<fileId>
 *  No escribe nada que haya que reenviar al usuario. */
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const args = new Map(process.argv.slice(2).map(a => {
  const i = a.indexOf('=');
  return i === -1 ? [a, ''] : [a.slice(0, i), a.slice(i + 1)];
}));
const matchId = args.get('--match');
const variant = Number(args.get('--variant'));
const chatId = args.get('--chat');
const audioFileId = args.get('--audio');
const out = args.get('--out') || process.env.MEDIA_PACK_DIR || '/data/media-pack';
const workerUrl = (process.env.WORKER_URL || 'https://goatlab-render.fly.dev').replace(/\/$/, '');

if (!matchId || !chatId || !audioFileId || !Number.isInteger(variant) || variant < 0) {
  console.error('drop-last-audio: faltan --match, --variant, --chat o --audio');
  process.exit(1);
}

await rm(join(dirname(out), 'pending', matchId, `${variant}.json`), { force: true });

const res = await fetch(`${workerUrl}/render/cancel`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${process.env.RENDER_SECRET ?? ''}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ chatId, matchId, variant, audioFileId }),
  signal: AbortSignal.timeout(20_000),
});
if (!res.ok) {
  console.error(`drop-last-audio: cancel HTTP ${res.status}`);
  process.exit(1);
}
console.log('dropped');
