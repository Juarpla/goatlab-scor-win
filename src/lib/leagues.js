/**
 * Single competition catalog: `public/data/leagues.json` is the source.
 * Each league has a stable internal id and per-provider codes (`api` for
 * API-Football, `fd` for Football-Data.org, `bzzoiro` for Bzzoiro). The
 * internal id travels across the site; endpoints use the matching provider
 * code through `providerLeagueId`.
 */
import catalog from '../../public/data/leagues.json' with { type: 'json' };

const PROVIDERS = ['api', 'fd', 'bzzoiro'];

/** Normalizes raw data to `{ id, name, providers: { api, fd, bzzoiro } }` with honest nulls. */
export function normalizeLeagueCatalog(source) {
  return Object.fromEntries(Object.entries(source?.leagues ?? {}).map(([id, entry]) => [id, {
    id,
    name: entry?.name ?? id,
    providers: {
      api: entry?.providers?.api ?? null,
      fd: entry?.providers?.fd ?? null,
      bzzoiro: entry?.providers?.bzzoiro?.id ?? entry?.providers?.bzzoiro ?? null,
    },
  }]));
}

/** Provider code collisions: `[{ provider, value, leagues: [a, b] }]`. */
export function findLeagueCollisions(source) {
  const seen = new Map();
  const collisions = [];
  for (const [id, entry] of Object.entries(source?.leagues ?? {})) {
    for (const provider of PROVIDERS) {
      const value = entry?.providers?.[provider]?.id ?? entry?.providers?.[provider] ?? null;
      if (value == null || value === '') continue;
      const key = `${provider}|${value}`;
      const previous = seen.get(key);
      if (previous && previous !== id) collisions.push({ provider, value, leagues: [previous, id] });
      else seen.set(key, id);
    }
  }
  return collisions;
}

export const leagues = normalizeLeagueCatalog(catalog);

const collisions = findLeagueCollisions(catalog);
if (collisions.length) {
  console.warn(`leagues.json: ${collisions.map(c => `${c.provider}=${c.value} (${c.leagues.join(', ')})`).join('; ')}`);
}

export function league(id) {
  return leagues[id] ?? null;
}

export function leagueName(id) {
  return leagues[id]?.name ?? null;
}

/** League code for a provider (`api` | `fd` | `bzzoiro`); null if it does not exist. */
export function providerLeagueId(id, provider) {
  const entry = leagues[id];
  if (!entry || !PROVIDERS.includes(provider)) return null;
  return entry.providers[provider];
}

/** Internal league from a provider external code; honest null. */
export function leagueByProviderId(provider, externalId) {
  if (externalId == null || externalId === '' || !PROVIDERS.includes(provider)) return null;
  for (const entry of Object.values(leagues)) {
    const value = entry.providers[provider];
    if (value != null && String(value) === String(externalId)) return entry;
  }
  return null;
}

/** Server-side persistence (scripts): resolves discovered Bzzoiro ids. */
export function mergeResolvedLeagues(base, resolved, { at = new Date().toISOString() } = {}) {
  const next = JSON.parse(JSON.stringify(base));
  next.leagues = next.leagues ?? {};
  for (const [id, row] of Object.entries(resolved ?? {})) {
    if (!next.leagues[id]) continue;
    next.leagues[id].providers = next.leagues[id].providers ?? {};
    next.leagues[id].providers.bzzoiro = {
      id: row?.id ?? null,
      name: row?.name ?? null,
      source: row?.source ?? 'Bzzoiro',
      resolvedAt: at,
    };
  }
  next.updatedAt = at;
  return next;
}
