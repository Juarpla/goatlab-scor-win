/** Explicit acceptance probe. Uses a disposable object, never the authority key. */
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { signR2 } from '../src/lib/r2-signed.js';
import { resolveStateConfig } from '../src/lib/r2-state-config.js';

export async function checkR2Cas({ env = process.env, fetchImpl = fetch } = {}) {
  const { account, access, secret } = resolveStateConfig(env);
  if (!account || !access || !secret || (env.R2_STATE_BUCKET ?? 'app-states') !== 'app-states') {
    throw new Error('Credenciales privadas de app-states incompletas');
  }
  const key = `goatlab/agnes-state-cas-test/${randomUUID()}.json`;
  const request = (method, value, headers = {}) => {
    const body = value === undefined ? undefined : Buffer.from(JSON.stringify(value));
    const signed = signR2({ account, access, secret, bucket: 'app-states', key, method, body, headers });
    return fetchImpl(signed.url, { method, headers: signed.headers, body, signal: AbortSignal.timeout(15_000) });
  };
  let created = false;
  try {
    const initial = await request('PUT', { revision: randomUUID() }, { 'if-none-match': '*' });
    if (!initial.ok) throw new Error(`Creación de ensayo HTTP ${initial.status}`);
    created = true;
    const read = await request('GET');
    const etag = read.headers.get('etag');
    if (!read.ok || !etag) throw new Error('Ensayo sin ETag confirmado');
    await read.arrayBuffer();
    const results = await Promise.all([
      request('PUT', { revision: randomUUID() }, { 'if-match': etag }),
      request('PUT', { revision: randomUUID() }, { 'if-match': etag }),
    ]);
    if (results.filter(r => r.ok).length !== 1 || results.filter(r => r.status === 412).length !== 1) {
      throw new Error('R2 no confirmó exactamente un ganador y un rechazo condicional');
    }
    return { passed: true, winners: 1, conditionalRejections: 1 };
  } finally {
    if (created) {
      const removed = await request('DELETE');
      if (!removed.ok) throw new Error('No se pudo confirmar la limpieza del objeto de ensayo');
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] !== '--run') {
    console.error('Uso: node scripts/check-agnes-r2-cas.mjs --run (requiere secrets privados)');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(await checkR2Cas())); }
    catch (error) { console.error(error.message); process.exitCode = 2; }
  }
}
