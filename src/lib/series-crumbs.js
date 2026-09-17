/**
 * Migajas del fallback del fallback ("construyendo serie"): buscadores puros
 * sobre los JSON horneados para rescatar datos reales del equipo sin serie
 * registrada. Todo lo que devuelven existe en la base; lo ausente es `null`
 * y la vista lo omite en silencio.
 */

/** Minúsculas sin tildes ni espacios sobrantes, para casar nombres de fuentes distintas. */
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
 * Fecha de la jornada desde el `round` del fixture ('League Stage - 1' → 1,
 * 5 → 5). Sin número (p. ej. 'Quarter-finals') devuelve `null`: la cabecera
 * ya nombra la competición y no filtramos inglés a la UI.
 */
export function roundFecha(round) {
  if (typeof round === 'number' && Number.isInteger(round)) return round;
  const hit = String(round ?? '').match(/(\d+)\s*$/);
  return hit ? Number(hit[1]) : null;
}

/** ¿Casa el nombre del fixture con el de la fila (`Beşiktaş JK` ≈ `Besiktas`)? */
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
 * Fila de tabla por `teamId` del fixture con fallback por nombre. Acepta
 * `played: 0` (arranque de fase liga): es dato real, no ausencia.
 */
export function findStandingRow(standingsJson, competitionId, { teamId = null, names = [] } = {}) {
  const row = matchRow(standingsJson?.[competitionId]?.rows, 'teamId', teamId, names);
  return row?.position != null ? { position: row.position, played: row.played ?? 0 } : null;
}

/** Mejor goleador del equipo en la competición (`null` si no hay muestra). */
export function topScorerFor(scorersJson, competitionId, { teamId = null, names = [] } = {}) {
  const row = matchRow(scorersJson?.[competitionId]?.scorers, 'teamId', teamId, names);
  return row?.player && row?.value != null
    ? { player: row.player, value: row.value, matches: row.matches ?? null }
    : null;
}
