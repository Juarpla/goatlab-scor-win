/**
 * Consenso externo como señal estadística, nunca como cuota.
 * Las cuotas decimales de los proveedores se convierten a probabilidad justa quitando el
 * margen (overround): fair = (1/cuota) / Σ(1/cuotas). Solo se publican
 * porcentajes interpretativos ("de cada 100 escenarios"), sin casas,
 * sin enlaces y sin valores decimales de cuota en la vista.
 */

const round3 = value => Math.round(value * 1000) / 1000;

const num = value => (typeof value === 'number' && Number.isFinite(value) && value > 1 ? value : null);

/** Probabilidad justa desde cuotas decimales (quita el margen). Null si no hay 2+ cuotas válidas. */
export function fairProbs(odds) {
  const valid = (odds ?? []).map(num).filter(Boolean);
  if (valid.length < 2) return null;
  const inv = valid.map(o => 1 / o);
  const sum = inv.reduce((a, b) => a + b, 0);
  if (!sum) return null;
  return inv.map(v => round3(v / sum));
}

/** Consenso medio de varios bookmakers por outcome: media de cuotas por posición. */
export function meanConsensus(list) {
  const rows = (list ?? []).filter(r => Array.isArray(r) && r.length >= 2);
  if (!rows.length) return null;
  const width = Math.max(...rows.map(r => r.length));
  const out = [];
  for (let i = 0; i < width; i++) {
    const col = rows.map(r => num(r[i])).filter(Boolean);
    out.push(col.length ? col.reduce((a, b) => a + b, 0) / col.length : null);
  }
  return out.every(v => v == null) ? null : out;
}

/**
 * Mapea un payload defensivo del proveedor a escenarios en 0-1.
 * Acepta consenso Bzzoiro ({home,draw,away} decimales o prob_* 0-100)
 * y filas API-Football ({home,draw,away} decimales por bookmaker).
 * Todo lo irreconocible → null honesto, nunca lanza.
 */
export function mapMarketProbs(input = {}) {
  try {
    const oneX2Odds = input.oneX2 ?? input.match_result ?? null;
    let oneX2 = null;
    if (oneX2Odds) {
      if (Array.isArray(oneX2Odds)) {
        const fair = fairProbs(meanConsensus(oneX2Odds) ?? oneX2Odds[0] ?? []);
        if (fair) oneX2 = { home: fair[0] ?? null, draw: fair[1] ?? null, away: fair[2] ?? null };
      } else if (typeof oneX2Odds === 'object') {
        const h = oneX2Odds.home ?? oneX2Odds.prob_home ?? null;
        const d = oneX2Odds.draw ?? oneX2Odds.prob_draw ?? null;
        const a = oneX2Odds.away ?? oneX2Odds.prob_away ?? null;
        // Si llegan como 0-100 (prob_*) se normalizan; si son decimales se quita margen.
        if ([h, d, a].every(v => typeof v === 'number' && v > 1 && v <= 100) && (h > 2 || d > 2 || a > 2) && Math.max(h, d, a) <= 100 && (h + d + a > 2)) {
          // Heurística: si la suma ronda 100 son %; si no, decimales con margen.
          if (h + d + a > 80 && h + d + a < 130) {
            const s = h + d + a;
            oneX2 = { home: round3(h / s), draw: round3(d / s), away: round3(a / s) };
          } else {
            const fair = fairProbs([h, d, a]);
            if (fair) oneX2 = { home: fair[0], draw: fair[1], away: fair[2] };
          }
        } else {
          const fair = fairProbs([h, d, a]);
          if (fair) oneX2 = { home: fair[0], draw: fair[1], away: fair[2] };
        }
      }
    }
    const pick = (...vals) => {
      for (const v of vals) {
        if (v == null) continue;
        if (typeof v === 'number' && v >= 0 && v <= 1) return round3(v);
        if (typeof v === 'number' && v > 1 && v <= 100) return round3(v / 100);
      }
      return null;
    };
    // Over/BTTS pueden venir como cuota decimal única o como prob ya en 0-1.
    const over25Odds = input.over25Odds ?? null;
    const bttsOdds = input.bttsOdds ?? null;
    let over25 = pick(input.over25, input.over_25, input.prob_over_25);
    let btts = pick(input.btts, input.prob_yes, input.bttsYes);
    if (over25 == null && Array.isArray(over25Odds) && over25Odds.length >= 2) {
      const fair = fairProbs(over25Odds);
      if (fair) over25 = fair[0];
    } else if (over25 == null && over25Odds && typeof over25Odds === 'object') {
      const fair = fairProbs([over25Odds.over ?? over25Odds.yes, over25Odds.under ?? over25Odds.no]);
      if (fair) over25 = fair[0];
    }
    if (btts == null && Array.isArray(bttsOdds) && bttsOdds.length >= 2) {
      const fair = fairProbs(bttsOdds);
      if (fair) btts = fair[0];
    } else if (btts == null && bttsOdds && typeof bttsOdds === 'object') {
      const fair = fairProbs([bttsOdds.yes, bttsOdds.no]);
      if (fair) btts = fair[0];
    }
    if (!oneX2 && over25 == null && btts == null) return null;
    return { oneX2, over25, btts, source: 'Mercado' };
  } catch {
    return null;
  }
}
