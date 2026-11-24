import { canonicalClubKey, resolveCanonical } from './teams.js';

/** Resolve the Bzzoiro namespace even when a fixture only carries FD/AF IDs. */
export function teamCrestId(catalog, name, explicitId) {
  if (Number.isSafeInteger(Number(explicitId)) && Number(explicitId) > 0) return Number(explicitId);
  const teams = catalog?.teams ?? catalog ?? {};
  const key = canonicalClubKey(name).replace(/\bosc\b/g, '').trim();
  const primary = Object.entries(teams).filter(([, team]) => [team.name, team.display].some(alias => canonicalClubKey(alias) === key));
  const exact = primary.length ? primary : Object.entries(teams).filter(([, team]) =>
    [team.name, team.display, ...(team.aliases ?? [])].some(alias => canonicalClubKey(alias) === key));
  const hit = exact.length === 1 ? exact[0][1] : resolveCanonical(catalog, name);
  const value = hit?.bzzoiro?.id ?? hit?.id;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
