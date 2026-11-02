/**
 * Scenarios derived from the providers (view, no own model).
 * Bzzoiro provides `oneX2` and API-Football provides `percent`; neither provides
 * two-outcome combinations or draw-no-bet: they are derived from the
 * result with the identities 1X = home+draw, X2 = draw+away,
 * draw-no-bet.home = home/(home+away).
 * Anything unrecognizable → honest null, never throws.
 */

const round3 = value => Math.round(value * 1000) / 1000;

const finiteNum = value => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

/** Normalizes a raw 1X2 to sum 1. Null if a side is missing or the sum is 0. */
export function normalizeOneX2(raw) {
  const home = finiteNum(raw?.home);
  const draw = finiteNum(raw?.draw);
  const away = finiteNum(raw?.away);
  if (home == null || draw == null || away == null) return null;
  const sum = home + draw + away;
  if (sum <= 0) return null;
  return { home: round3(home / sum), draw: round3(draw / sum), away: round3(away / sum) };
}

/** Dos resultados combinados derivados de un resultado normalizado. */
export function deriveDoubleChance(oneX2) {
  if (!oneX2 || oneX2.home == null || oneX2.draw == null || oneX2.away == null) return null;
  return {
    '1X': round3(oneX2.home + oneX2.draw),
    X2: round3(oneX2.draw + oneX2.away),
    '12': round3(oneX2.home + oneX2.away),
  };
}

/** Draw-no-bet derived from a normalized result. */
export function deriveDnb(oneX2) {
  if (!oneX2 || oneX2.home == null || oneX2.away == null) return null;
  const total = oneX2.home + oneX2.away;
  if (total <= 0) return null;
  const home = round3(oneX2.home / total);
  return { home, away: round3(1 - home) };
}

/** Decisiveness: distance between home and away. 0 when there is no reading. */
export function decisiveness(oneX2) {
  if (!oneX2 || oneX2.home == null || oneX2.away == null) return 0;
  return Math.abs(oneX2.home - oneX2.away);
}

/**
 * Chooses the least conservative reading (the most decisive).
 * Returns 'bz' | 'af' | null. Tie → 'bz' (Bzzoiro owns the waffle).
 */
export function pickDecisive(bzOneX2, afOneX2) {
  if (bzOneX2 && !afOneX2) return 'bz';
  if (afOneX2 && !bzOneX2) return 'af';
  if (!bzOneX2 || !afOneX2) return null;
  return decisiveness(afOneX2) > decisiveness(bzOneX2) ? 'af' : 'bz';
}
