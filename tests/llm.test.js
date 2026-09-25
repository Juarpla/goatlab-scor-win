import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveChain, withFailover, extractJson, hasTransportFailure, hasPermanentFailure, hasTruncatedFailure, createProviderBreaker, parseRetryAfter } from '../src/lib/llm.js';
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
  assert.equal(result.model, 'deepseek-v4-flash');
});
test('thinking, nested data, arrays and braces in strings parse correctly', () => {
  assert.deepEqual(extractJson('<think>{ignore}</think>```json\n{"items":[{"label":"a } b"}]}\n```'), { items: [{ label: 'a } b' }] });
  assert.deepEqual(extractJson('Resultado: [1, {"a": 2}] fin'), [1, { a: 2 }]);
});
test('el truncado por techo de tokens se clasifica como transporte reintentable', async () => {
  const capped = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 800, completion_tokens: 3000 } }));
  const error = await withFailover([], { env, logger, fetchImpl: async () => capped(), maxTokens: 3000, validate: extractJson }).catch(e => e);
  assert.equal(hasTransportFailure(error), true);
  assert.equal(hasTruncatedFailure(error), true);
  assert.deepEqual(error.details.map(d => d.kind), ['transport', 'transport']);
  assert.ok(error.details.every(d => d.truncated === true));
  assert.deepEqual(error.details[0].usage, { inputTokens: 800, outputTokens: 3000 });
});
test('finish_reason length marca truncado aunque el uso no cuadre', async () => {
  const error = await withFailover([], { env, logger, fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'length' }] })), maxTokens: 3000, validate: extractJson }).catch(e => e);
  assert.equal(hasTruncatedFailure(error), true);
});
test('el éxito propaga usage, finishReason y callId', async () => {
  const result = await withFailover([], { env, logger, fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 7 } })), validate: extractJson });
  assert.deepEqual(result.usage, { inputTokens: 5, outputTokens: 7 });
  assert.equal(result.finishReason, 'stop');
  assert.ok(result.callId);
});
test('el fusible excluye tras 3 transportes seguidos y perdona al que responde', () => {
  const breaker = createProviderBreaker({ maxConsecutiveFailures: 3 });
  assert.deepEqual(breaker.excluded(), []);
  breaker.note('MISTRAL', { kind: 'transport' });
  breaker.note('MISTRAL', { kind: 'transport' });
  assert.deepEqual(breaker.excluded(), []);
  breaker.note('MISTRAL', { kind: 'transport' });
  assert.deepEqual(breaker.excluded(), ['MISTRAL']);
  breaker.note('MISTRAL', { kind: 'validation' });
  assert.deepEqual(breaker.excluded(), []);
  breaker.note('MISTRAL', { kind: 'transport' });
  breaker.note('MISTRAL', { kind: 'transport', retryAfterMs: 60_000 });
  assert.ok(breaker.excluded().includes('MISTRAL'));
});
test('withFailover salta excluidos y registra skipped sin quemar intentos', async () => {
  let calls = 0;
  const result = await withFailover([], { env, logger, excludeProviders: ['MISTRAL'], fetchImpl: async () => { calls += 1; return response('{"ok":true}'); }, validate: extractJson });
  assert.equal(calls, 1);
  assert.equal(result.provider, 'OPENCODE_GO');
});
test('fusible integrado: tras la racha el proveedor deja de intentarse', async () => {
  const breaker = createProviderBreaker({ maxConsecutiveFailures: 1 });
  let mistralCalls = 0;
  const fetchImpl = async (url, init) => {
    if (JSON.parse(init.body).model === 'mistral-small-latest') { mistralCalls += 1; return new Response('', { status: 429 }); }
    return response('{"ok":true}');
  };
  await withFailover([], { env, logger, breaker, fetchImpl, validate: extractJson });
  assert.equal(mistralCalls, 1);
  const again = await withFailover([], { env, logger, breaker, fetchImpl, validate: extractJson });
  assert.equal(mistralCalls, 1);
  assert.equal(again.provider, 'OPENCODE_GO');
});
test('Retry-After del 429 queda en details para el fusible', async () => {
  const error = await withFailover([], { env: { OPENCODE_GO_API_KEY: 'x' }, logger, fetchImpl: async () => new Response('', { status: 429, headers: { 'retry-after': '5' } }) }).catch(e => e);
  assert.ok(error.details.every(d => d.retryAfterMs === 5000));
});
test('parseRetryAfter acepta segundos y fechas, ignora basura', () => {
  assert.equal(parseRetryAfter('5'), 5000);
  assert.equal(parseRetryAfter(null), 0);
  assert.equal(parseRetryAfter('basura'), 0);
  assert.ok(parseRetryAfter(new Date(Date.now() + 30_000).toUTCString()) > 0);
});
test('el 400 es permanente y no reintentable como transporte', async () => {
  const error = await withFailover([], { env, logger, fetchImpl: async () => new Response('', { status: 400 }) }).catch(e => e);
  assert.equal(hasTransportFailure(error), false);
  assert.equal(hasPermanentFailure(error), true);
  assert.deepEqual(error.details.map(d => d.kind), ['permanent', 'permanent']);
});
test('mimo omite temperature para evitar 400 en thinking mode', async () => {
  const calls = [];
  const mimoEnv = { OPENCODE_GO_API_KEY: 'x', LLM_PROVIDER_ORDER: 'OPENCODE_GO_MODEL', OPENCODE_GO_MODEL: 'mimo-v2.6-flash' };
  const result = await withFailover([], { env: mimoEnv, logger, fetchImpl: async (url, init) => { calls.push(JSON.parse(init.body)); return response('{"ok":true}'); }, validate: extractJson });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'mimo-v2.6-flash');
  assert.ok(!('temperature' in calls[0]));
  assert.equal(result.model, 'mimo-v2.6-flash');
});
test('workers AI construye URL con account id y usa glm-4.7-flash', async () => {
  const calls = [];
  const wEnv = { WORKERS_AI_API_KEY: 'x', CLOUDFLARE_ACCOUNT_ID: 'abc123', LLM_PROVIDER_ORDER: 'WORKERS_AI_MODEL', WORKERS_AI_MODEL: '@cf/zai-org/glm-4.7-flash' };
  const chain = resolveChain(wEnv, logger);
  assert.equal(chain[0].id, 'WORKERS_AI');
  assert.equal(chain[0].model, '@cf/zai-org/glm-4.7-flash');
  await withFailover([], { env: wEnv, logger, fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return response('{"ok":true}'); }, validate: extractJson });
  assert.ok(calls[0].url === 'https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1/chat/completions');
  assert.equal(calls[0].body.temperature, 0);
});
test('opencode go construye URL zen/go sin duplicar chat/completions', async () => {
  const calls = [];
  const oEnv = { OPENCODE_GO_API_KEY: 'x', LLM_PROVIDER_ORDER: 'OPENCODE_GO_MODEL', OPENCODE_GO_MODEL: 'mimo-v2.6-flash' };
  await withFailover([], { env: oEnv, logger, fetchImpl: async (url) => { calls.push(url); return response('{"ok":true}'); }, validate: extractJson });
  assert.ok(calls[0] === 'https://opencode.ai/zen/go/v1/chat/completions');
});
