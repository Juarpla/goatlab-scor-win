/**
 * Crumbs for the fallback of the fallback ("building series"): pure lookups
 * over baked JSON to rescue real data for a team without a recorded
 * series. Everything they return exists in the base; missing values are `null`
 * and the view omits them silently.
 */

/** Lowercase without accents or extra spaces, to match names from different sources. */
export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matchday number from the fixture `round` ('League Stage - 1' → 1,
 * 5 → 5). Without a number (e.g. 'Quarter-finals') it returns `null`: the header
 * already names the competition and we do not leak English into the UI.
 */
export function roundNumber(round) {
  if (typeof round === 'number' && Number.isInteger(round)) return round;
  const hit = String(round ?? '').match(/(\d+)\s*$/);
  return hit ? Number(hit[1]) : null;
}

/** Does the fixture name match the row name (`Beşiktaş JK` ≈ `Besiktas`)? */
function nameHit(rowTeam, wanted) {
  const row = normalizeName(rowTeam);
  if (!row || !wanted) return false;
  return row === wanted || (wanted.length >= 4 && (row.includes(wanted) || wanted.includes(row)));
}

function matchRow(rows, teamKey, teamId, names) {
  if (!Array.isArray(rows)) return null;
  if (teamId != null) {
    const byId = rows.find(row => row?.[teamKey] === teamId);
    if (byId) return byId;
  }
  for (const name of names.map(normalizeName).filter(Boolean)) {
    const byName = rows.find(row => nameHit(row?.team, name));
    if (byName) return byName;
  }
  return null;
}

/**
 * Standings row by fixture `teamId` with a name fallback. Accepts
 * `played: 0` (league phase start): it is real data, not absence.
 */
export function findStandingRow(standingsJson, competitionId, { teamId = null, names = [] } = {}) {
  const row = matchRow(standingsJson?.[competitionId]?.rows, 'teamId', teamId, names);
  return row?.position != null ? { position: row.position, played: row.played ?? 0 } : null;
}

/** Team top scorer in the competition (`null` if there is no sample). */
export function topScorerFor(scorersJson, competitionId, { teamId = null, names = [] } = {}) {
  const row = matchRow(scorersJson?.[competitionId]?.scorers, 'teamId', teamId, names);
  return row?.player && row?.value != null
    ? { player: row.player, value: row.value, matches: row.matches ?? null }
    : null;
}
