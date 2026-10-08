/** Cliente R2 mínimo (stdlib, sin dependencias) para el banco de medios.
 *  Estructura: partidos/<matchId>/<0-3.jpg|png,clip-0-1.mp4>.
 *  Env: R2_ACCOUNT_ID (o CLOUDFLARE_ACCOUNT_ID), R2_ACCESS_KEY_ID,
 *  R2_SECRET_ACCESS_KEY, R2_BUCKET (defecto goatlab), R2_PUBLIC_BASE.
 *  Nunca imprime credenciales: los comandos informativos devuelven JSON sin secretos. */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { signR2 as signRequest } from '../src/lib/r2-signed.js';
import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { addUsage, monthUsage } from '../src/lib/r2-usage.js';

const localEnv = (() => { if (process.env.R2_NO_DOTENV) return {}; try {
  const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  return Object.fromEntries(raw.split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
} catch { return {}; } })();
const env = (k, d = '') => process.env[k] ?? localEnv[k] ?? d;

export const R2_BUCKET = env('R2_BUCKET', 'goatlab');
const ACCOUNT = env('R2_ACCOUNT_ID') || env('CLOUDFLARE_ACCOUNT_ID');
const KEY = env('R2_ACCESS_KEY_ID');
const SECRET = env('R2_SECRET_ACCESS_KEY');
const HOST = `${ACCOUNT}.r2.cloudflarestorage.com`;
const PUBLIC_BASE = (env('R2_PUBLIC_BASE') || '').replace(/\/$/, '');
const LEDGER = env('R2_LEDGER', 'public/data/r2-usage.json');
const operations = { opsA: 0, opsB: 0 };

// Topes internos al 80% del free tier (10 GB, 1M op-A, 10M op-B).
export const BUDGET = Object.freeze({ storageBytes: 8_000_000_000, opsA: 800_000, opsB: 8_000_000, warnAt: [0.7, 0.9] });

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function sign({ method, key, query = {}, headers = {}, bodyHash, date = new Date(), access = KEY, secret = SECRET, bucket = R2_BUCKET, host = HOST, region = 'auto', service = 's3' }) {
  return signRequest({ method, key, query, headers, bodyHash, date, access, secret, bucket, host, region, service });
}

async function req(method, key, { body, contentType, headers: extra = {} } = {}) {
  if (!ACCOUNT || !KEY || !SECRET) throw new Error('faltan credenciales R2 (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY)');
  const bytes = body ?? Buffer.alloc(0);
  const bodyHash = sha256(bytes);
  const { url, headers } = sign({ method, key, bodyHash, headers: { ...(contentType ? { 'content-type': contentType } : {}), ...extra } });
  if (method === 'PUT') operations.opsA++;
  else if (method === 'GET' || method === 'HEAD') operations.opsB++;
  const r = await fetch(url, { method, headers, body: method === 'PUT' ? bytes : undefined, signal: AbortSignal.timeout(30_000) });
  return r;
}

export async function put(key, bytes, contentType, meta = {}) {
  const metaHeaders = Object.fromEntries(Object.entries(meta).filter(([, v]) => v != null).map(([k, v]) => [`x-amz-meta-${k}`, String(v).slice(0, 1500)]));
  const r = await req('PUT', key, { body: bytes, contentType, headers: metaHeaders });
  if (!r.ok) throw new Error(`R2 PUT ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return { key, bytes: bytes.length };
}
export async function exists(key) {
  const r = await req('HEAD', key);
  if (r.status === 404) return false;
  if (!r.ok) throw new Error(`R2 HEAD ${r.status}`);
  const meta = {};
  r.headers.forEach((v, k) => { if (k.startsWith('x-amz-meta-')) meta[k.slice(11)] = v; });
  return { key, bytes: Number(r.headers.get('content-length') || 0), meta };
}
export async function del(key) {
  const r = await req('DELETE', key);
  if (!r.ok && r.status !== 404) throw new Error(`R2 DELETE ${r.status}`);
  return { key, deleted: r.ok };
}
export async function delPrefix(prefix) {
  if (!/^partidos\/[A-Za-z0-9][A-Za-z0-9_-]{0,199}\/$/.test(prefix)) throw new Error('prefijo de partido inválido: requiere ID y barra final');
  const out = [];
  for (const o of await listAll(prefix)) out.push(await del(o.key));
  if ((await listAll(prefix)).length) throw new Error('R2: quedan objetos después de la poda');
  return out;
}
const xmlValue = value => value.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|\d+);/gi, entity => {
  const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
  if (named[entity]) return named[entity];
  return String.fromCodePoint(entity.startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1)));
});
export function parseR2List(xml, prefix) {
  if (!/<(?:\w+:)?ListBucketResult\b/.test(xml) || !/<\/(?:\w+:)?ListBucketResult>/.test(xml)) throw new Error('R2 LIST inválido');
  const objects = [];
  for (const item of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = item[1].match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
    const size = item[1].match(/<Size>(\d+)<\/Size>/)?.[1];
    if (key == null || size == null) throw new Error('R2 LIST objeto incompleto');
    const decoded = xmlValue(key);
    if (!decoded.startsWith(prefix)) throw new Error('R2 LIST fuera del prefijo solicitado');
    objects.push({ key: decoded, bytes: Number(size) });
  }
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const next = xmlValue(xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? '');
  if (truncated && !next) throw new Error('R2 LIST paginación incompleta');
  return { objects, next: truncated ? next : '' };
}
export async function listAll(prefix) {
  const keys = [];
  let token = '';
  for (;;) {
    const q = { 'list-type': '2', prefix, 'max-keys': '1000', ...(token ? { 'continuation-token': token } : {}) };
    const bodyHash = sha256(Buffer.alloc(0));
    const { url, headers } = sign({ method: 'GET', key: '', query: q, bodyHash });
    operations.opsA++;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`R2 LIST ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const xml = await r.text();
    const { objects, next } = parseR2List(xml, prefix);
    keys.push(...objects);
    if (!next) break;
    if (next === token) throw new Error('R2 LIST paginación repetida');
    token = next;
  }
  return keys;
}

export function publicUrl(key) {
  if (!PUBLIC_BASE) throw new Error('falta R2_PUBLIC_BASE');
  return `${PUBLIC_BASE}/${String(key).split('/').map(enc).join('/')}`;
}

function readLedger() { try { return JSON.parse(readFileSync(LEDGER, 'utf8')); } catch { return { opsA: 0, opsB: 0 }; } }
function writeLedger(v) { try { mkdirSync(dirname(LEDGER), { recursive: true }); const temp = `${LEDGER}.${process.pid}.tmp`; writeFileSync(temp, JSON.stringify(v)); renameSync(temp, LEDGER); return true; } catch { return false; } }

export async function budget() {
  const objects = await listAll('partidos/');
  const bytes = objects.reduce((t, o) => t + o.bytes, 0);
  const { opsA, opsB, media, control } = monthUsage(readLedger());
  const ratio = { storage: bytes / BUDGET.storageBytes, opsA: opsA / BUDGET.opsA, opsB: opsB / BUDGET.opsB };
  const max = Math.max(ratio.storage, ratio.opsA, ratio.opsB);
  return { files: objects.length, bytes, opsA, opsB, media, control, estimated: true, monthUTC: new Date().toISOString().slice(0, 7), ratio, ok: max < 1, level: max >= 1 ? 'block' : max >= BUDGET.warnAt[1] ? 'warn90' : max >= BUDGET.warnAt[0] ? 'warn70' : 'ok' };
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = value => {
    try { const data = JSON.parse(value); console.log(JSON.stringify({ ...data, operations: { media: { ...operations } } })); }
    catch { console.log(value); }
  };
  if (cmd === 'put') { const [local, key, type, ...kv] = rest; const meta = Object.fromEntries(kv.map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; })); await put(key, readFileSync(local), type || 'application/octet-stream', meta).then(r => out(JSON.stringify(r))); }
  else if (cmd === 'exists') { out(JSON.stringify({ key: rest[0], found: await exists(rest[0]) })); }
  else if (cmd === 'del') { for (const k of rest) out(JSON.stringify(await del(k))); }
  else if (cmd === 'del-prefix') { out(JSON.stringify({ ok: true, prefix: rest[0], deleted: (await delPrefix(rest[0])).length })); }
  else if (cmd === 'public') { out(publicUrl(rest[0])); }
  else if (cmd === 'budget') { out(JSON.stringify(await budget())); }
  else if (cmd === 'record') {
    const next = addUsage(readLedger(), { media: { opsA: Number(rest[0] || 0), opsB: Number(rest[1] || 0) }, control: { opsA: Number(rest[2] || 0), opsB: Number(rest[3] || 0) } });
    out(JSON.stringify({ ...next, saved: writeLedger(next) }));
  }
  else if (cmd === 'sync-dir') {
    const [localDir, prefix] = rest;
    for (const f of (await readdir(localDir)).filter(f => /\.(jpg|jpeg|png|webp|mp4)$/i.test(f))) {
      const bytes = readFileSync(join(localDir, f));
      const type = /\.mp4$/i.test(f) ? 'video/mp4' : /\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg';
      out(JSON.stringify(await put(`${prefix}/${f}`, bytes, type)));
    }
  } else { console.error('uso: put|exists|del|del-prefix|public|budget|record|sync-dir'); process.exit(2); }
}
