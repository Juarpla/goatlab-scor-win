/**
 * Mercados derivados de los proveedores (vista, sin modelo propio).
 * Bzzoiro trae `oneX2` y API-Football trae `percent`; ninguno trae
 * doble oportunidad ni DNB: se derivan del 1X2 con las identidades
 * 1X = home+draw, X2 = draw+away, DNB.home = home/(home+away).
 * Todo lo irreconocible → null honesto, nunca lanza.
 */

const round3 = value => Math.round(value * 1000) / 1000;

const finiteNum = value => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

/** Normaliza un 1X2 crudo a suma 1. Null si falta algún lado o la suma es 0. */
export function normalizeOneX2(raw) {
  const home = finiteNum(raw?.home);
  const draw = finiteNum(raw?.draw);
  const away = finiteNum(raw?.away);
  if (home == null || draw == null || away == null) return null;
  const sum = home + draw + away;
  if (sum <= 0) return null;
  return { home: round3(home / sum), draw: round3(draw / sum), away: round3(away / sum) };
}

/** Doble oportunidad derivada de un 1X2 normalizado. */
export function deriveDoubleChance(oneX2) {
  if (!oneX2 || oneX2.home == null || oneX2.draw == null || oneX2.away == null) return null;
  return {
    '1X': round3(oneX2.home + oneX2.draw),
    X2: round3(oneX2.draw + oneX2.away),
    '12': round3(oneX2.home + oneX2.away),
  };
}

/** Gana sin contar el empate (DNB) derivado de un 1X2 normalizado. */
export function deriveDnb(oneX2) {
  if (!oneX2 || oneX2.home == null || oneX2.away == null) return null;
  const total = oneX2.home + oneX2.away;
  if (total <= 0) return null;
  const home = round3(oneX2.home / total);
  return { home, away: round3(1 - home) };
}

/** Decisividad: distancia entre local y visita. 0 cuando no hay lectura. */
export function decisiveness(oneX2) {
  if (!oneX2 || oneX2.home == null || oneX2.away == null) return 0;
  return Math.abs(oneX2.home - oneX2.away);
}

/**
 * Elige la lectura menos conservadora (la más decisiva).
 * Devuelve 'bz' | 'af' | null. Empate → 'bz' (Bzzoiro manda el waffle).
 */
export function pickDecisive(bzOneX2, afOneX2) {
  if (bzOneX2 && !afOneX2) return 'bz';
  if (afOneX2 && !bzOneX2) return 'af';
  if (!bzOneX2 || !afOneX2) return null;
  return decisiveness(afOneX2) > decisiveness(bzOneX2) ? 'af' : 'bz';
}
