/** Cliente R2 mínimo (stdlib, sin dependencias) para el banco de medios.
 *  Estructura: partidos/<matchId>/<0-3.jpg|png,clip-0-1.mp4>.
 *  Env: R2_ACCOUNT_ID (o CLOUDFLARE_ACCOUNT_ID), R2_ACCESS_KEY_ID,
 *  R2_SECRET_ACCESS_KEY, R2_BUCKET (defecto goatlab), R2_PUBLIC_BASE.
 *  Nunca imprime credenciales: los comandos informativos devuelven JSON sin secretos. */
import { createHash, createHmac } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

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

// Topes internos al 80% del free tier (10 GB, 1M op-A, 10M op-B).
export const BUDGET = Object.freeze({ storageBytes: 8_000_000_000, opsA: 800_000, opsB: 8_000_000, warnAt: [0.7, 0.9] });

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const hmac = (k, d) => createHmac('sha256', k).update(d).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function sign({ method, key, query = {}, headers = {}, bodyHash, date = new Date(), access = KEY, secret = SECRET, bucket = R2_BUCKET, host = HOST, region = 'auto', service = 's3' }) {
  const t = date.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const day = t.slice(0, 8);
  const uri = String(key) ? '/' + bucket + '/' + String(key).split('/').map(enc).join('/') : '/' + bucket + '/';
  const qs = Object.keys(query).sort().map(k => `${enc(k)}=${enc(query[k])}`).join('&');
  const hs = { host, 'x-amz-content-sha256': bodyHash, 'x-amz-date': t, ...headers };
  const signed = Object.keys(hs).sort().join(';');
  const headerBlock = Object.keys(hs).sort().map(k => `${k}:${String(hs[k]).trim()}`).join('\n') + '\n';
  const canonical = [method, uri, qs, headerBlock, signed, bodyHash].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', t, scope, sha256(canonical)].join('\n');
  if (process.env.R2_DEBUG) console.error(JSON.stringify({ canonical, toSign }));
  const signing = hmac(hmac(hmac(hmac('AWS4' + secret, day), region), service), 'aws4_request');
  const signature = createHmac('sha256', signing).update(toSign).digest('hex');
  return { url: `https://${host}${uri}${qs ? '?' + qs : ''}`, headers: { ...hs, Authorization: `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signed}, Signature=${signature}` } };
}

async function req(method, key, { body, contentType, headers: extra = {} } = {}) {
  if (!ACCOUNT || !KEY || !SECRET) throw new Error('faltan credenciales R2 (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY)');
  const bytes = body ?? Buffer.alloc(0);
  const bodyHash = sha256(bytes);
  const { url, headers } = sign({ method, key, bodyHash, headers: { ...(contentType ? { 'content-type': contentType } : {}), ...extra } });
  const r = await fetch(url, { method, headers, body: method === 'PUT' ? bytes : undefined });
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
  const out = [];
  for (const o of await listAll(prefix)) out.push(await del(o.key));
  return out;
}
export async function listAll(prefix) {
  const keys = [];
  let token = '';
  for (;;) {
    const q = { 'list-type': '2', prefix, 'max-keys': '1000', ...(token ? { 'continuation-token': token } : {}) };
    const bodyHash = sha256(Buffer.alloc(0));
    const { url, headers } = sign({ method: 'GET', key: '', query: q, bodyHash });
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`R2 LIST ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const xml = await r.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>\s*<Size>(\d+)<\/Size>/g)) keys.push({ key: m[1], bytes: Number(m[2]) });
    const next = (xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) || [])[1] || '';
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml) || !next) break;
    token = next;
  }
  return keys;
}

export function publicUrl(key) {
  if (!PUBLIC_BASE) throw new Error('falta R2_PUBLIC_BASE');
  return `${PUBLIC_BASE}/${String(key).split('/').map(enc).join('/')}`;
}

function readLedger() { try { return JSON.parse(readFileSync(LEDGER, 'utf8')); } catch { return { opsA: 0, opsB: 0 }; } }
function writeLedger(v) { try { writeFileSync(LEDGER, JSON.stringify({ ...v, updatedAt: new Date().toISOString() })); return true; } catch { return false; } }

export async function budget() {
  const objects = await listAll('partidos/');
  const bytes = objects.reduce((t, o) => t + o.bytes, 0);
  const { opsA = 0, opsB = 0 } = readLedger();
  const ratio = { storage: bytes / BUDGET.storageBytes, opsA: opsA / BUDGET.opsA, opsB: opsB / BUDGET.opsB };
  const max = Math.max(ratio.storage, ratio.opsA, ratio.opsB);
  return { files: objects.length, bytes, opsA, opsB, ratio, ok: max < 1, level: max >= 1 ? 'block' : max >= BUDGET.warnAt[1] ? 'warn90' : max >= BUDGET.warnAt[0] ? 'warn70' : 'ok' };
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd) {
  const out = console.log;
  if (cmd === 'put') { const [local, key, type, ...kv] = rest; const meta = Object.fromEntries(kv.map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; })); await put(key, readFileSync(local), type || 'application/octet-stream', meta).then(r => out(JSON.stringify(r))); }
  else if (cmd === 'exists') { out(JSON.stringify({ key: rest[0], found: await exists(rest[0]) })); }
  else if (cmd === 'del') { for (const k of rest) out(JSON.stringify(await del(k))); }
  else if (cmd === 'del-prefix') { out(JSON.stringify({ prefix: rest[0], deleted: (await delPrefix(rest[0])).length })); }
  else if (cmd === 'public') { out(publicUrl(rest[0])); }
  else if (cmd === 'budget') { out(JSON.stringify(await budget())); }
  else if (cmd === 'record') {
    const cur = readLedger();
    const next = { opsA: (cur.opsA || 0) + Number(rest[0] || 0), opsB: (cur.opsB || 0) + Number(rest[1] || 0) };
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
