/** Portable OpenAI-wire client. Environment is injected; secrets never enter client bundles. */
const runtimeEnv = () => globalThis.process?.env ?? {};

/** Fallo de red/HTTP/timeout/vacío/truncado: reintentar puede ayudar. */
export class LlmTransportError extends Error {
  constructor(message, { provider = null, truncated = false, retryAfterMs = 0, usage = null } = {}) {
    super(message);
    this.name = 'LlmTransportError';
    this.kind = 'transport';
    this.provider = provider;
    this.truncated = truncated;
    this.retryAfterMs = retryAfterMs;
    this.usage = usage;
  }
}

/** Fallo permanente 4xx (modelo/params/auth): reintentar no ayuda. */
export class LlmPermanentError extends Error {
  constructor(message, { provider = null, usage = null } = {}) {
    super(message);
    this.name = 'LlmPermanentError';
    this.kind = 'permanent';
    this.provider = provider;
    this.usage = usage;
  }
}

export const providers = {
  // baseUrl admite override opcional (MISTRAL_BASE_URL) para servir modelos
  // de la misma firma OpenAI a través de otra pasarela.
  MISTRAL: { name: 'Mistral', keyVar: 'MISTRAL_API_KEY', defaultModel: 'mistral-small-latest', requires: [], baseUrl: env => env.MISTRAL_BASE_URL?.trim() || 'https://api.mistral.ai/v1' },
  WORKERS_AI: { name: 'Workers AI', keyVar: 'WORKERS_AI_API_KEY', defaultModel: '@cf/zai-org/glm-4.7-flash', requires: ['CLOUDFLARE_ACCOUNT_ID'], baseUrl: env => env.WORKERS_AI_BASE_URL?.trim() || `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1` },
  OPENCODE_GO: { name: 'OpenCode Go', keyVar: 'OPENCODE_GO_API_KEY', defaultModel: 'deepseek-v4-flash', requires: [], baseUrl: () => 'https://opencode.ai/zen/go/v1', extraHeaders: (_env, sessionId) => ({ 'user-agent': 'GoatLab/1.0', 'x-opencode-session': sessionId }) },
};
export function resolveChain(env = runtimeEnv(), logger = console) {
  const order = env.LLM_PROVIDER_ORDER ?? 'MISTRAL_MODEL,WORKERS_AI_MODEL,OPENCODE_GO_MODEL';
  const seen = new Set();
  return order.split(',').flatMap(value => {
    const id = value.trim().replace(/_MODEL$/, '');
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const provider = providers[id];
    if (!provider) { logger.warn(`LLM: proveedor desconocido ${id}`); return []; }
    const missing = [provider.keyVar, ...provider.requires].filter(key => !env[key]?.trim());
    if (missing.length) { logger.warn(`LLM: ${id} omitido; faltan ${missing.join(', ')}`); return []; }
    return [{ ...provider, id, model: env[`${id}_MODEL`]?.trim() || provider.defaultModel }];
  });
}
export async function callProvider(provider, messages, { env = runtimeEnv(), fetchImpl = fetch, timeoutMs = 180_000, maxTokens, sessionId = crypto.randomUUID() } = {}) {
  let res;
  // Mimo en thinking mode no acepta temperature custom (fuerza 1.0/0.95): omitir evita HTTP 400.
  const omitTemperature = String(provider.model ?? '').toLowerCase().startsWith('mimo-');
  try {
    res = await fetchImpl(`${provider.baseUrl(env).replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env[provider.keyVar]}`, ...provider.extraHeaders?.(env, sessionId) },
      body: JSON.stringify({ model: provider.model, ...(omitTemperature ? {} : { temperature: 0 }), messages, ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }) }),
    });
  } catch (error) {
    throw new LlmTransportError(error?.message ?? 'Error de red', { provider: provider.id });
  }
  // Do not copy provider response bodies into logs: they may echo prompts or credentials.
  if (!res.ok) {
    if ([400, 401, 403, 404, 422].includes(res.status)) throw new LlmPermanentError(`HTTP ${res.status}`, { provider: provider.id });
    throw new LlmTransportError(`HTTP ${res.status}`, { provider: provider.id, retryAfterMs: parseRetryAfter(res.headers?.get?.('retry-after')) });
  }
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  const usage = normalizeUsage(body?.usage);
  const finishReason = body?.choices?.[0]?.finish_reason ?? null;
  if (typeof content !== 'string' || !content.trim()) throw new LlmTransportError('Respuesta vacía o inválida', { provider: provider.id, usage });
  if (finishReason === 'length' || (maxTokens !== undefined && usage.outputTokens != null && usage.outputTokens >= maxTokens)) {
    throw new LlmTransportError(`Respuesta truncada (techo ${maxTokens} tokens)`, { provider: provider.id, truncated: true, usage });
  }
  return { content: content.trim(), usage, finishReason };
}
/** Retry-After en segundos o fecha HTTP → ms (tope 10 min). */
export function parseRetryAfter(value, now = Date.now()) {
  if (value == null || value === '') return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 600) * 1000;
  const at = Date.parse(String(value));
  if (Number.isFinite(at)) return Math.min(Math.max(at - now, 0), 600_000);
  return 0;
}
function normalizeUsage(raw) {
  if (!raw || typeof raw !== 'object') return { inputTokens: null, outputTokens: null };
  const input = raw.prompt_tokens ?? raw.input_tokens ?? null;
  const output = raw.completion_tokens ?? raw.output_tokens ?? null;
  return {
    inputTokens: Number.isFinite(Number(input)) && input !== '' ? Number(input) : null,
    outputTokens: Number.isFinite(Number(output)) && output !== '' ? Number(output) : null,
  };
}
export function hasTransportFailure(error) {
  return Array.isArray(error?.details) && error.details.some(detail => detail?.kind === 'transport');
}
export function hasPermanentFailure(error) {
  return Array.isArray(error?.details) && error.details.some(detail => detail?.kind === 'permanent');
}
export function hasTruncatedFailure(error) {
  return Array.isArray(error?.details) && error.details.some(detail => detail?.truncated === true);
}
/**
 * Fusible por corrida: tras N fallos de transporte seguidos un proveedor se
 * salta el resto de la corrida (el orden configurado no se toca). Cualquier
 * respuesta (ok o validación) perdona la racha. Retry-After pausa además
 * hasta la fecha indicada.
 */
export function createProviderBreaker({ maxConsecutiveFailures = 3 } = {}) {
  const state = new Map();
  return {
    excluded(now = Date.now()) {
      return [...state.entries()]
        .filter(([, s]) => s.consecutive >= maxConsecutiveFailures || s.skipUntil > now)
        .map(([id]) => id);
    },
    note(id, { kind = 'unknown', retryAfterMs = 0, now = Date.now() } = {}) {
      const s = state.get(id) ?? { consecutive: 0, skipUntil: 0 };
      s.consecutive = kind === 'transport' ? s.consecutive + 1 : 0;
      if (retryAfterMs > 0) s.skipUntil = Math.max(s.skipUntil, now + retryAfterMs);
      state.set(id, s);
    },
    reset() { state.clear(); },
  };
}
export async function withFailover(messages, options = {}) {
  const env = options.env ?? runtimeEnv();
  const chain = resolveChain(env, options.logger ?? console);
  const breaker = options.breaker ?? null;
  const skipped = new Set([...(options.excludeProviders ?? []), ...(breaker?.excluded() ?? [])]);
  const failures = [];
  const details = [];
  const sessionId = crypto.randomUUID();
  for (const provider of chain) {
    if (skipped.has(provider.id)) {
      details.push({ provider: provider.id, model: provider.model, kind: 'skipped', reason: 'Pausado por el fusible o la lista de exclusión' });
      continue;
    }
    let call;
    const started = Date.now();
    try {
      call = await callProvider(provider, messages, { ...options, env, sessionId });
    } catch (error) {
      const transport = error instanceof LlmTransportError;
      const permanent = error instanceof LlmPermanentError;
      const kind = transport ? 'transport' : permanent ? 'permanent' : 'unknown';
      breaker?.note(provider.id, { kind, retryAfterMs: transport ? error.retryAfterMs ?? 0 : 0 });
      failures.push(new Error(`${provider.name}/${provider.model}: ${error.message}`));
      details.push({ provider: provider.id, model: provider.model, kind, reason: String(error?.message ?? error), truncated: transport ? Boolean(error.truncated) : false, usage: error.usage ?? null, retryAfterMs: transport ? error.retryAfterMs ?? 0 : 0, latencyMs: Date.now() - started });
      continue;
    }
    let value;
    try {
      value = options.validate ? await options.validate(call.content) : call.content;
    } catch (error) {
      breaker?.note(provider.id, { kind: 'validation' });
      failures.push(new Error(`${provider.name}/${provider.model}: ${error?.message ?? 'Validación rechazada'}`));
      details.push({ provider: provider.id, model: provider.model, kind: 'validation', reason: String(error?.message ?? error), truncated: false, usage: call.usage, retryAfterMs: 0, latencyMs: Date.now() - started });
      continue;
    }
    if (value === false || value === undefined || value === null) {
      breaker?.note(provider.id, { kind: 'validation' });
      failures.push(new Error(`${provider.name}/${provider.model}: Validación rechazada`));
      details.push({ provider: provider.id, model: provider.model, kind: 'validation', reason: 'Validación rechazada', truncated: false, usage: call.usage, retryAfterMs: 0, latencyMs: Date.now() - started });
      continue;
    }
    breaker?.note(provider.id, { kind: 'ok' });
    return { value, provider: provider.id, model: provider.model, usage: call.usage, finishReason: call.finishReason, callId: sessionId };
  }
  const aggregate = new AggregateError(failures, failures.length ? failures.map(e => e.message).join('; ') : details.length ? `No hay proveedores LLM disponibles (fusible): ${details.map(d => `${d.provider} (${d.kind})`).join(', ')}` : 'No hay proveedores LLM configurados');
  aggregate.details = details;
  throw aggregate;
}
export function extractJson(content) {
  const text = content.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(text); } catch { /* Find balanced JSON, including nested structures and quoted braces. */ }
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{' && text[start] !== '[') continue;
    const stack = []; let quoted = false; let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (quoted) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quoted = false; continue; }
      if (ch === '"') { quoted = true; continue; }
      if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') {
        if (stack.pop() !== (ch === '}' ? '{' : '[')) break;
        if (!stack.length) { try { return JSON.parse(text.slice(start, i + 1)); } catch { break; } }
      }
    }
  }
  throw new Error('No se encontró JSON válido');
}
