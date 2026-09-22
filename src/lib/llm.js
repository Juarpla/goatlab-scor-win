/** Portable OpenAI-wire client. Environment is injected; secrets never enter client bundles. */
const runtimeEnv = () => globalThis.process?.env ?? {};

/** Fallo de red/HTTP/timeout/vacío: reintentar puede ayudar. */
export class LlmTransportError extends Error {
  constructor(message, { provider = null } = {}) {
    super(message);
    this.name = 'LlmTransportError';
    this.kind = 'transport';
    this.provider = provider;
  }
}

/** Respuesta llegó pero no pasó la validación (JSON/esquema): reintentar igual no ayuda. */
export class LlmValidationError extends Error {
  constructor(message, { provider = null } = {}) {
    super(message);
    this.name = 'LlmValidationError';
    this.kind = 'validation';
    this.provider = provider;
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
export async function callProvider(provider, messages, { env = runtimeEnv(), fetchImpl = fetch, timeoutMs = 120_000, maxTokens, sessionId = crypto.randomUUID() } = {}) {
  let res;
  try {
    res = await fetchImpl(`${provider.baseUrl(env).replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env[provider.keyVar]}`, ...provider.extraHeaders?.(env, sessionId) },
      body: JSON.stringify({ model: provider.model, temperature: 0, messages, ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }) }),
    });
  } catch (error) {
    throw new LlmTransportError(error?.message ?? 'Error de red', { provider: provider.id });
  }
  // Do not copy provider response bodies into logs: they may echo prompts or credentials.
  if (!res.ok) throw new LlmTransportError(`HTTP ${res.status}`, { provider: provider.id });
  const content = (await res.json())?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new LlmTransportError('Respuesta vacía o inválida', { provider: provider.id });
  return content.trim();
}
export function hasTransportFailure(error) {
  return Array.isArray(error?.details) && error.details.some(detail => detail?.kind === 'transport');
}
export async function withFailover(messages, options = {}) {
  const env = options.env ?? runtimeEnv();
  const chain = resolveChain(env, options.logger ?? console);
  const failures = [];
  const details = [];
  const sessionId = crypto.randomUUID();
  for (const provider of chain) {
    try {
      const content = await callProvider(provider, messages, { ...options, env, sessionId });
      let value;
      try {
        value = options.validate ? await options.validate(content) : content;
      } catch (error) {
        throw new LlmValidationError(error?.message ?? 'Validación rechazada', { provider: provider.id });
      }
      if (value === false || value === undefined || value === null) throw new LlmValidationError('Validación rechazada', { provider: provider.id });
      return { value, provider: provider.id, model: provider.model };
    } catch (error) {
      const kind = error instanceof LlmTransportError ? 'transport' : error instanceof LlmValidationError ? 'validation' : 'unknown';
      failures.push(new Error(`${provider.name}/${provider.model}: ${error.message}`));
      details.push({ provider: provider.id, model: provider.model, kind, reason: String(error?.message ?? error) });
    }
  }
  const aggregate = new AggregateError(failures, failures.length ? failures.map(e => e.message).join('; ') : 'No hay proveedores LLM configurados');
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
