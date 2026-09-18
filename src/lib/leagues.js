/**
 * Catálogo único de competiciones: `public/data/leagues.json` es la fuente.
 * Cada liga tiene id interno estable y códigos por proveedor (`api` para
 * API-Football, `fd` para Football-Data.org, `bzzoiro` para Bzzoiro). El id
 * interno es el que viaja por todo el sitio; los endpoints usan el código
 * del proveedor que corresponda vía `providerLeagueId`.
 */
import catalog from '../../public/data/leagues.json' with { type: 'json' };

const PROVIDERS = ['api', 'fd', 'bzzoiro'];

/** Normaliza el crudo a `{ id, name, providers: { api, fd, bzzoiro } }` con nulls honestos. */
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

/** Colisiones de códigos de proveedor: `[{ provider, value, leagues: [a, b] }]`. */
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

/** Código de la liga para un proveedor (`api` | `fd` | `bzzoiro`); null si no existe. */
export function providerLeagueId(id, provider) {
  const entry = leagues[id];
  if (!entry || !PROVIDERS.includes(provider)) return null;
  return entry.providers[provider];
}

/** Liga interna a partir del código externo de un proveedor; null honesto. */
export function leagueByProviderId(provider, externalId) {
  if (externalId == null || externalId === '' || !PROVIDERS.includes(provider)) return null;
  for (const entry of Object.values(leagues)) {
    const value = entry.providers[provider];
    if (value != null && String(value) === String(externalId)) return entry;
  }
  return null;
}

/** Persistencia del lado servidor (scripts): resuelve ids Bzzoiro descubiertos. */
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
