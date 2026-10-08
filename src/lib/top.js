import { buildPruneContext, resolvePruneMatch, pruneDue } from './pruning.js';

/** Top-5 por relevancia como dato compartido: se calcula en 1-update-data y
 *  todos los consumidores (guiones, prompts, banco de medios) leen el mismo.
 *  `extra` protege peticiones manuales (--match o top ampliado) de la poda. */
export const TOP_FILENAME = 'top.json';
export const TOP_VERSION = 1;

/** Manual requests bypass age only; malformed or future rankings still fail closed. */
export function topFreshness(top, { now = Date.now(), env = {}, manual = false } = {}) {
  const result = (valid, reason, ageHours = null, stale = false) => ({ valid, reason, ageHours, stale });
  if (top == null) return result(false, 'missing');
  const safeId = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id);
  if (typeof top !== 'object' || Array.isArray(top) || top.version !== TOP_VERSION || !Array.isArray(top.ranking)
    || top.ranking.some(row => !row || typeof row !== 'object' || Array.isArray(row) || !safeId(row.id))
    || (top.extra !== undefined && (!Array.isArray(top.extra) || top.extra.some(id => !safeId(id))))
    || typeof top.generatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(top.generatedAt) || !Number.isFinite(now)) return result(false, 'invalid');
  const generatedAt = Date.parse(top.generatedAt);
  if (!Number.isFinite(generatedAt)) return result(false, 'invalid');
  const ageHours = (now - generatedAt) / 3_600_000;
  if (generatedAt > now) return result(false, 'future', ageHours);
  const raw = env?.TOP_MAX_AGE_HOURS;
  const configured = raw == null || String(raw).trim() === '' ? NaN : Number(raw);
  const maxHours = Number.isFinite(configured) && configured >= 0 ? configured : 7;
  if (ageHours > maxHours) return result(manual === true, manual === true ? 'manual-age-bypass' : 'stale', ageHours, true);
  return result(true, 'fresh', ageHours);
}

export function defaultTopN(env = {}) {
  const n = Number(env?.SCRIPT_TOP_N);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 5;
}

export function rankingIds(top) {
  return (top?.ranking ?? []).map(r => r?.id).filter(Boolean);
}

/** Conjunto efectivo: ranking.slice(0, n) ∪ extra, sin duplicados. */
export function effectiveIds(top, n) {
  const keep = new Set([...rankingIds(top).slice(0, Math.max(0, n)), ...(top?.extra ?? [])]);
  return [...keep];
}

/** Ids NS seleccionables según fixtures; no constituyen permiso de poda. */
export function liveIds(matches) {
  return new Set((matches ?? []).filter(m => m?.status === 'NS').map(m => m.webId ?? m.id));
}

/** Fusiona ids manuales en extra; devuelve el top actualizado y lo añadido. */
export function registerExtra(top, ids) {
  const base = Array.isArray(top?.extra) ? top.extra : [];
  const have = new Set(base);
  const added = (ids ?? []).filter(id => id && !have.has(id));
  for (const id of added) have.add(id);
  return { top: { ...(top ?? { ranking: [] }), extra: [...have] }, added };
}

/** Manual extras retire only after a confirmed terminal episode plus its grace. */
export function pruneExtra(top, matches, ledger = null, now = Date.now()) {
  // Legacy callers supplied only a set of NS IDs, which cannot prove a finish.
  const context = buildPruneContext(Array.isArray(matches) ? matches : [], ledger);
  const extra = (top?.extra ?? []).filter(id => !pruneDue(resolvePruneMatch(id, context), context.seen, now));
  return { ...(top ?? { ranking: [] }), extra };
}
