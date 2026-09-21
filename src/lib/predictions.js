/** Independent Poisson baseline. Estimates are withheld until an external historical evaluation passes. */
import { sameClub, canonicalClubKey } from './teams.js';
export function goalDistribution(lambda, max = 20) {
  if (!Number.isFinite(lambda) || lambda < 0 || lambda > 8) throw new Error('Media de goles fuera de rango');
  const probabilities = [Math.exp(-lambda)];
  for (let k = 1; k <= max; k++) probabilities.push(probabilities[k - 1] * lambda / k);
  return probabilities;
}
export function predictGoals(homeLambda, awayLambda) {
  const home = goalDistribution(homeLambda), away = goalDistribution(awayLambda);
  let homeWin = 0, draw = 0, awayWin = 0, total = 0, overTwo = 0, bothScore = 0;
  const scores = [];
  for (let h = 0; h < home.length; h++) for (let a = 0; a < away.length; a++) {
    const p = home[h] * away[a]; total += p;
    if (h > a) homeWin += p; else if (h === a) draw += p; else awayWin += p;
    if (h + a >= 3) overTwo += p;
    if (h > 0 && a > 0) bothScore += p;
    scores.push({ home: h, away: a, probability: p });
  }
  return { homeWin: homeWin / total, draw: draw / total, awayWin: awayWin / total, threeOrMoreGoals: overTwo / total, bothScore: bothScore / total, scores: scores.sort((a,b) => b.probability-a.probability).slice(0,5).map(score => ({...score, probability: score.probability / total})), method: 'Poisson independiente', validated: false };
}
export function publishablePrediction(prediction, evaluation) {
  // No fabricated backtest: the caller must provide an independently produced evaluation.
  if (!evaluation || evaluation.modelVersion !== 'poisson-v1' || !Number.isInteger(evaluation.sampleSize) || evaluation.sampleSize < 200 || !Number.isFinite(evaluation.brierScore) || !Number.isFinite(evaluation.baselineBrierScore) || evaluation.brierScore < 0 || evaluation.brierScore >= evaluation.baselineBrierScore || !evaluation.evaluatedAt || Number.isNaN(Date.parse(evaluation.evaluatedAt))) return null;
  return { ...prediction, validated: true, evaluation };
}

/* ---- Veredicto GoatLab (ensemble). Cada insumo declara su peso; lo ausente vale 0. ---- */

const HOME_BOOST = 1.08, AWAY_PENALTY = 0.92;
const clip = (value, min, max) => Math.min(max, Math.max(min, value));
const round3 = value => Math.round(value * 1000) / 1000;

/** Rolling goals profile of one team from the results base, most recent first.
 *  Dedup por fecha+rival canónico: el mismo partido capturado por AF y FD
 *  (nombres corto/largo) cuenta una sola vez. */
export function teamRates(results, team, count = 6) {
  const seen = new Set();
  const played = [];
  const sorted = (results ?? []).filter(row => row.homeScore != null && row.awayScore != null && (sameClub(row.home, team) || sameClub(row.away, team)))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const row of sorted) {
    const rival = sameClub(row.home, team) ? row.away : row.home;
    // Rival suelto por primer token: AF acorta («Brighton») y FD alarga
    // («Brighton Hove Albion»); mismo día + mismo marcador = mismo partido.
    const rivalLoose = canonicalClubKey(rival).split(' ')[0] || canonicalClubKey(rival);
    const key = `${row.date}|${rivalLoose}|${row.homeScore}-${row.awayScore}`;
    if (seen.has(key)) continue;
    seen.add(key);
    played.push(row);
    if (played.length >= count) break;
  }
  if (played.length < 3) return null;
  const sum = key => played.reduce((total, row) => total + (sameClub(row.home, team) ? row[key] : key === 'homeScore' ? row.awayScore : row.homeScore), 0);
  return { played: played.length, gf: sum('homeScore') / played.length, ga: sum('awayScore') / played.length };
}

/** Poisson λ for one fixture; null-honest when either side lacks three prior results. */
export function estimateLambdas(results, home, away) {
  const homeRates = teamRates(results, home);
  const awayRates = teamRates(results, away);
  if (!homeRates || !awayRates) return null;
  const homeLambda = (homeRates.gf + awayRates.ga) / 2 * HOME_BOOST;
  const awayLambda = (awayRates.gf + homeRates.ga) / 2 * AWAY_PENALTY;
  return { home: round3(clip(homeLambda, 0.15, 4.5)), away: round3(clip(awayLambda, 0.15, 4.5)) };
}

const FAVORED = { shotsOnTarget: 1, xg: 1, possession: 1, corners: 1, fouls: -1, yellowCards: -1 };
/** Multi-metric rolling index from the Bzzoiro history base → advantage in [-1, 1] (positive favors home). */
export function performanceIndex(history, home, away, count = 6) {
  const metricRows = (team, metric) => (history ?? [])
    .filter(row => row?.statistics && (sameClub(row.home, team) || sameClub(row.away, team)))
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, count)
    .map(row => {
      const own = sameClub(row.home, team) ? row.statistics.home : row.statistics.away;
      const value = own?.[metric];
      return value == null ? null : FAVORED[metric] === -1 ? -value : value;
    }).filter(value => value != null);
  const metrics = Object.keys(FAVORED);
  const means = {};
  for (const metric of metrics) {
    const homeMean = metricRows(home, metric);
    const awayMean = metricRows(away, metric);
    if (homeMean.length < 3 || awayMean.length < 3) { means[metric] = null; continue; }
    const avg = list => list.reduce((a, b) => a + b, 0) / list.length;
    const h = avg(homeMean), a = avg(awayMean);
    means[metric] = h + a === 0 ? null : round3((h - a) / (h + a)); // scaled diff in [-1, 1]
  }
  const available = metrics.filter(metric => means[metric] != null);
  if (!available.length) return { advantage: null, means, sample: {} };
  const advantage = round3(clip(available.reduce((sum, metric) => sum + means[metric], 0) / available.length, -1, 1));
  return { advantage, means };
}

/** Recent-form points tilt in [-1, 1]; null when either side lacks form. */
export function formTilt(homeForm, awayForm) {
  if (!homeForm || !awayForm) return null;
  const points = form => form.form.reduce((sum, letter) => sum + (letter === 'G' ? 3 : letter === 'E' ? 1 : 0), 0);
  const total = points(homeForm) + points(awayForm);
  return total === 0 ? null : round3((points(homeForm) - points(awayForm)) / total * 2);
}

/** Head-to-head tilt in [-1, 1]; requires at least three recorded meetings. */
export function h2hTilt(h2h) {
  const total = h2h?.totalMatches;
  if (!Number.isInteger(total) || total < 3 || h2h.homeWins == null || h2h.awayWins == null) return null;
  return round3(clip((h2h.homeWins - h2h.awayWins) / total, -1, 1));
}

/** Empirical draw share of the results sample; falls back to the league-typical 0.26. */
export function drawBase(results) {
  const rows = (results ?? []).filter(row => row.homeScore != null && row.awayScore != null);
  if (rows.length < 30) return 0.26;
  return rows.filter(row => row.homeScore === row.awayScore).length / rows.length;
}

const normalize1x2 = dist => {
  const sum = (dist.home + dist.draw + dist.away) || 1;
  return { home: dist.home / sum, draw: dist.draw / sum, away: dist.away / sum };
};

/** A signal tilt t∈[-1,1] becomes a 1X2 distribution: draw stays at the base rate. */
function signalDistribution(tilt, base) {
  const home = (1 - base) / (1 + Math.exp(-2 * tilt));
  const away = (1 - base) - home;
  return { home, draw: base, away };
}

/* ---- Veredicto GoatLab: ensemble de insumos declarados ---- */

/**
 * Combina Poisson propio, CatBoost (Bzzoiro) y señales de rendimiento en un veredicto 1X2.
 * Cada insumo declara su peso en el digest; lo ausente aporta 0 y se dice. Los factores
 * cualitativos (sede, ausencias) no mueven números: solo acompañan la lectura.
 */
export function ensemble({ results = [], history = [], h2h = null, catboost = null, market = null, home, away, homeForm = null, awayForm = null, unavailable = null } = {}) {
  if (!home || !away) return null;
  const lambdas = estimateLambdas(results, home, away);
  const poisson = lambdas ? predictGoals(lambdas.home, lambdas.away) : null;
  const cbRaw = catboost?.oneX2;
  const cb = cbRaw && cbRaw.home != null && cbRaw.draw != null && cbRaw.away != null ? normalize1x2(cbRaw) : null;
  const mkRaw = market?.oneX2;
  const mk = mkRaw && mkRaw.home != null && mkRaw.draw != null && mkRaw.away != null ? normalize1x2(mkRaw) : null;
  const signals = [
    { label: 'Racha y forma', tilt: formTilt(homeForm, awayForm), weight: 0.45 },
    { label: 'Índice de rendimiento', tilt: performanceIndex(history, home, away).advantage, weight: 0.35 },
    { label: 'Historial cara a cara', tilt: h2hTilt(h2h), weight: 0.2 },
  ];
  const active = signals.filter(signal => signal.tilt != null);
  const activeWeight = active.reduce((sum, signal) => sum + signal.weight, 0);
  const parts = [];
  const inputs = [];
  // Con mercado: 0.40 CatBoost + 0.25 Poisson + 0.20 Mercado + 0.15 señales.
  // Sin mercado: reparto histórico 0.5 / 0.3-0.8 / 0.2 (tests y metodología).
  const wCb = mk ? 0.4 : 0.5;
  const wPoisson = mk ? 0.25 : cb ? 0.3 : 0.8;
  const wMarket = mk ? 0.2 : 0;
  const wSignals = mk ? 0.15 : 0.2;
  if (cb) {
    parts.push({ weight: wCb, dist: cb });
    inputs.push({ label: 'CatBoost (Bzzoiro)', weight: wCb, detail: `confianza del proveedor ${catboost.confidence ?? '—'}` });
  } else {
    inputs.push({ label: 'CatBoost (Bzzoiro)', weight: 0, detail: 'sin captura del proveedor para este encuentro' });
  }
  if (poisson) {
    parts.push({ weight: wPoisson, dist: { home: poisson.homeWin, draw: poisson.draw, away: poisson.awayWin } });
    inputs.push({ label: 'Poisson (GoatLab)', weight: wPoisson, detail: `λ ${lambdas.home} – ${lambdas.away} (tasas de goles recientes)` });
  } else {
    inputs.push({ label: 'Poisson (GoatLab)', weight: 0, detail: 'sin muestra suficiente de ambos equipos' });
  }
  if (mk) {
    parts.push({ weight: wMarket, dist: mk });
    inputs.push({ label: 'Mercado (consenso)', weight: wMarket, detail: 'lectura del mercado en porcentajes, sin cuotas ni casas' });
  } else {
    inputs.push({ label: 'Mercado (consenso)', weight: 0, detail: 'sin lectura del mercado para este encuentro' });
  }
  for (const signal of active) {
    const weight = wSignals * signal.weight / activeWeight;
    parts.push({ weight, dist: signalDistribution(signal.tilt, drawBase(results)) });
    inputs.push({ label: signal.label, weight: round3(weight), detail: `señal ${signal.tilt > 0 ? 'a favor del local' : signal.tilt < 0 ? 'a favor del visitante' : 'equilibrada'} (${signal.tilt})` });
  }
  for (const signal of signals.filter(signal => signal.tilt == null)) {
    inputs.push({ label: signal.label, weight: 0, detail: 'sin datos suficientes' });
  }
  inputs.push({ label: 'Localía y sede', weight: 0, detail: 'factor cualitativo: no mueve el número' });
  const absences = unavailable ? (unavailable.home ?? 0) + (unavailable.away ?? 0) : 0;
  inputs.push({ label: 'Ausencias confirmadas', weight: 0, detail: absences ? `${absences} jugador(es) fuera según la alineación publicada` : 'sin bajas confirmadas al momento de la captura' });
  if (!parts.length) return null;
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const oneX2 = {
    home: round3(parts.reduce((sum, part) => sum + part.weight * part.dist.home, 0) / totalWeight),
    draw: round3(parts.reduce((sum, part) => sum + part.weight * part.dist.draw, 0) / totalWeight),
    away: round3(parts.reduce((sum, part) => sum + part.weight * part.dist.away, 0) / totalWeight),
  };
  const blend = (poissonValue, cbValue, mkValue) => {
    const vals = [poissonValue, cbValue, mkValue].filter(v => v != null);
    if (!vals.length) return null;
    return round3(vals.reduce((a, b) => a + b, 0) / vals.length);
  };
  return {
    oneX2,
    over25: blend(poisson?.threeOrMoreGoals ?? null, catboost?.over25 ?? null, market?.over25 ?? null),
    btts: blend(poisson?.bothScore ?? null, catboost?.btts ?? null, market?.btts ?? null),
    inputs,
    method: 'goatlab-ensemble-v1',
  };
}

/** El veredicto se publica con porcentajes solo cuando la evaluación histórica independiente pasa. */
export function publishableVerdict(verdict, evaluation) {
  if (!verdict || !evaluation || evaluation.modelVersion !== 'goatlab-ensemble-v1' || evaluation.published !== true) return { ...verdict, published: false, evaluation: evaluation ?? null };
  return { ...verdict, published: true, evaluation };
}


/* ---- Evaluación histórica (backtest). Funciones puras; las alimenta scripts/evaluate-predictions.mjs. ---- */

export function oneX2Outcome(homeScore, awayScore) {
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
  return homeScore > awayScore ? 'home' : homeScore === awayScore ? 'draw' : 'away';
}

/** Multiclass Brier over a sample of {predicted: {home,draw,away}, outcome: 'home'|'draw'|'away'}. */
export function evaluateOneX2(sample) {
  const rows = (sample ?? []).filter(row => row?.predicted?.home != null && row?.predicted?.draw != null && row?.predicted?.away != null && row.outcome);
  if (rows.length < 30) return null;
  const share = label => rows.filter(row => row.outcome === label).length / rows.length;
  const base = { home: share('home'), draw: share('draw'), away: share('away') };
  const brierOf = getDist => rows.reduce((sum, row) => sum + (['home', 'draw', 'away']).reduce((total, label) => {
    const probability = getDist(row)[label];
    const target = row.outcome === label ? 1 : 0;
    return total + (probability - target) ** 2;
  }, 0), 0) / rows.length;
  const correct = rows.filter(row => Object.keys(row.predicted).reduce((best, label) => (row.predicted[label] > row.predicted[best] ? label : best), 'home') === row.outcome).length;
  return { sampleSize: rows.length, accuracy: correct / rows.length, brierScore: round3(brierOf(row => row.predicted)), baselineBrierScore: round3(brierOf(() => base)), baseline: { home: round3(base.home), draw: round3(base.draw), away: round3(base.away) } };
}

/** Binary Brier over a sample of {predicted: p|null, happened: 0|1}. */
export function evaluateBinary(sample) {
  const rows = (sample ?? []).filter(row => row.predicted != null && row.happened != null);
  if (rows.length < 30) return null;
  const base = rows.filter(row => row.happened === 1).length / rows.length;
  const meanSquaredError = predictions => rows.reduce((sum, row, index) => sum + (predictions[index] - row.happened) ** 2, 0) / rows.length;
  const correct = rows.filter(row => (row.predicted >= 0.5) === (row.happened === 1)).length / rows.length;
  return { sampleSize: rows.length, accuracy: round3(correct), brierScore: round3(meanSquaredError(rows.map(row => row.predicted))), baselineBrierScore: round3(meanSquaredError(rows.map(() => base))), baseline: round3(base) };
}

/** Publication gate: the sample must be large and must beat the constant baseline on every market it claims. */
export function evaluationGate({ poissonOneX2, ensembleOneX2 = null, ensembleOver25 = null, ensembleBtts = null }) {
  const passes = metrics => metrics && metrics.sampleSize >= 200 && metrics.brierScore < metrics.baselineBrierScore;
  const ensemblePasses = metrics => Boolean(metrics && metrics.sampleSize >= 100 && metrics.brierScore < metrics.baselineBrierScore);
  const poissonOk = passes(poissonOneX2);
  // El veredicto publicado es el ensemble completo: sin muestra pre-partido no se publica nada.
  const published = poissonOk
    && ensemblePasses(ensembleOneX2)
    && (!ensembleOver25 || ensemblePasses(ensembleOver25))
    && (!ensembleBtts || ensemblePasses(ensembleBtts));
  return { poissonOk, published };
}
