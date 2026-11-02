import { buildPruneContext, resolvePruneMatch, pruneDue } from './pruning.js';

/** Top of scripts, prompts and bank as shared data: computed in
 *  1-update-data and everyone reads the same. `priority` is informational. `extra` protects manual requests
 *  (--match or extended top) from pruning. */
export const TOP_FILENAME = 'top.json';
export const TOP_VERSION = 1;

/** Internal provider id (`fd-575357`). It is not a descriptive code and does not enter the queue. */
export function providerOnlyId(id) {
  return /^(?:fd|af|bz)-[0-9]+$/.test(id ?? '');
}

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

/** Editorial priority never enlarges the requested number of slots. */
export function selectionCount(top, n) {
  const requested = Number(n);
  const ask = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 0;
  return ask;
}

/** Effective set: ranking.slice(0, cut) ∪ extra, without duplicates. */
export function effectiveIds(top, n) {
  const keep = new Set([...rankingIds(top).slice(0, selectionCount(top, n)), ...(top?.extra ?? [])]);
  return [...keep];
}

/** NS ids selectable per fixtures; they do not constitute permission to prune. */
export function liveIds(matches) {
  return new Set((matches ?? []).filter(m => m?.status === 'NS').map(m => m.webId ?? m.id));
}

/** Merges manual ids into extra; returns the updated top and what was added. */
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

/** Shared automatic queue: first five ranked IDs, excluding manual extras.
 * A match that starts between stages drops out without introducing an unscripted replacement. */
export function automaticMatches(top, matches, now = Date.now()) {
  const byId = new Map((matches ?? []).map(m => [m.webId ?? m.id, m]));
  return [...new Set(top?.selectionIds ?? rankingIds(top).slice(0, 5))].slice(0, 5)
    .map(id => byId.get(id))
    .filter(m => m && m.status === 'NS' && Date.parse(m.kickoff) > now);
}

/** Shared selector for scripts, prompts, the media gate and the media producer. */
export function contentMatches(top, matches, { automatic = false, onlyMatch = null, n = 5, limit = null, now = Date.now() } = {}) {
  if (onlyMatch) {
    if (typeof onlyMatch !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(onlyMatch)) throw new Error('ID de partido inválido');
    return (matches ?? []).filter(m => m.id === onlyMatch || m.webId === onlyMatch);
  }
  if (automatic) return automaticMatches(top, matches, now);
  const wanted = new Set(top?.selectionIds ?? effectiveIds(top, n));
  const selected = [...new Map((matches ?? []).filter(m => wanted.has(m.webId ?? m.id) && m.status === 'NS' && Date.parse(m.kickoff) > now)
    .map(m => [m.webId ?? m.id, m])).values()];
  const order = [...wanted];
  selected.sort((a,b) => order.indexOf(a.webId ?? a.id) - order.indexOf(b.webId ?? b.id));
  return limit == null ? selected : selected.slice(0, Math.max(1, Math.floor(Number(limit)) || 1));
}
