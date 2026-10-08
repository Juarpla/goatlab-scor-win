import test from 'node:test';
import assert from 'node:assert/strict';
import { checkR2Cas } from '../scripts/check-agnes-r2-cas.mjs';

const env = { R2_STATE_ACCOUNT_ID: 'account', R2_STATE_ACCESS_KEY_ID: 'access', R2_STATE_SECRET_ACCESS_KEY: 'secret' };
test('real probe confines writes to disposable key and requires one 412', async () => {
  let etag = null;
  const paths = [], methods = [];
  const fetchImpl = async (url, options) => {
    paths.push(new URL(url).pathname); methods.push(options.method);
    if (options.method === 'GET') return new Response('{}', { headers: { etag } });
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    if (options.headers['if-match'] && options.headers['if-match'] !== etag) return new Response(null, { status: 412 });
    etag = `"${JSON.parse(options.body).revision}"`;
    return new Response(null, { status: 200 });
  };
  assert.deepEqual(await checkR2Cas({ env, fetchImpl }), { passed: true, winners: 1, conditionalRejections: 1 });
  assert.equal(new Set(paths).size, 1);
  assert.match(paths[0], /^\/app-states\/goatlab\/agnes-state-cas-test\/[a-f0-9-]+\.json$/);
  assert.equal(methods.at(-1), 'DELETE');
});
test('probe fails closed when conditional semantics are missing and cleans up', async () => {
  let deleted = false;
  await assert.rejects(checkR2Cas({ env, fetchImpl: async (_url, options) => {
    if (options.method === 'DELETE') deleted = true;
    return new Response('{}', { headers: { etag: '"unchanged"' } });
  } }), /exactamente un ganador/);
  assert.equal(deleted, true);
  await assert.rejects(checkR2Cas({ env: {} }), /incompletas/);
});
