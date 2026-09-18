import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveChain, withFailover, extractJson, hasTransportFailure } from '../src/lib/llm.js';
const logger = { warn() {} };
const env = { MISTRAL_API_KEY: 'test-a', OPENCODE_GO_API_KEY: 'test-b' };
const response = content => new Response(JSON.stringify({ choices: [{ message: { content } }] }));
test('runtime resolution skips missing credentials and requirements and deduplicates', () => {
  assert.deepEqual(resolveChain({ ...env, WORKERS_AI_API_KEY: 'x', LLM_PROVIDER_ORDER: 'UNKNOWN_MODEL,MISTRAL_MODEL,MISTRAL_MODEL,WORKERS_AI_MODEL,OPENCODE_GO_MODEL' }, logger).map(p => p.id), ['MISTRAL', 'OPENCODE_GO']);
});
test('HTTP error falls through exactly once and keeps temperature zero', async () => {
  const calls = [];
  const result = await withFailover([], { env, logger, fetchImpl: async (url, init) => { calls.push({ url, init }); return calls.length === 1 ? new Response('', { status: 429 }) : response('{"ok":true}'); }, validate: extractJson });
  assert.equal(calls.length, 2); assert.equal(result.value.ok, true);
  assert.equal(JSON.parse(calls[1].init.body).temperature, 0);
  assert.ok(calls[1].init.headers['x-opencode-session']);
});
test('caller validation failure and empty responses are aggregated', async () => {
  let calls = 0;
  await assert.rejects(withFailover([], { env, logger, fetchImpl: async () => response(++calls === 1 ? 'bad json' : ''), validate: extractJson }), error => error instanceof AggregateError && error.errors.length === 2);
});
test('no credentials degrades with a clear aggregate error', async () => {
  await assert.rejects(withFailover([], { env: {}, logger }), /No hay proveedores/);
});
test('los fallos quedan tipados: transporte vs validación', async () => {
  const transport = await withFailover([], { env, logger, fetchImpl: async () => new Response('', { status: 429 }) }).catch(error => error);
  assert.equal(hasTransportFailure(transport), true);
  assert.deepEqual(transport.details.map(d => d.kind), ['transport', 'transport']);
  const validation = await withFailover([], { env, logger, fetchImpl: async () => response('bad json'), validate: extractJson }).catch(error => error);
  assert.equal(hasTransportFailure(validation), false);
  assert.deepEqual(validation.details.map(d => d.kind), ['validation', 'validation']);
  assert.ok(validation.details.every(d => d.provider && d.reason));
});
test('el proveedor que revive corta la cadena y reporta su modelo', async () => {
  const result = await withFailover([], { env, logger, fetchImpl: async (url, init) => JSON.parse(init.body).model === 'mistral-small-latest'
    ? new Response('', { status: 500 })
    : response('{"ok":true}'), validate: extractJson });
  assert.equal(result.provider, 'OPENCODE_GO');
  assert.equal(result.model, 'glm-5.3-flash');
});
test('thinking, nested data, arrays and braces in strings parse correctly', () => {
  assert.deepEqual(extractJson('<think>{ignore}</think>```json\n{"items":[{"label":"a } b"}]}\n```'), { items: [{ label: 'a } b' }] });
  assert.deepEqual(extractJson('Resultado: [1, {"a": 2}] fin'), [1, { a: 2 }]);
});
