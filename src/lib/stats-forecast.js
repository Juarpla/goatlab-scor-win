/**
 * Pronóstico de estadísticas del partido (build time, sin LLM).
 *
 * Espejo de `estimateLambdas` para las 9 métricas del acta: el valor esperado
 * de cada equipo sale de su promedio propio + lo que el rival concede,
 * encogido a la media de la competición con muestra corta. Sin muestra
 * suficiente la métrica queda en null y la vista la omite: nunca se inventa.
 * Las comparativas (duelos 1X2, último gol, carrera a córners, margen) se
 * derivan de los mismos ritmos con Poisson independiente.
 */
import { sameClub } from './teams.js';
import { goalDistribution } from './predictions.js';

export const STAT_METRICS = ['possession', 'shots', 'shotsOnTarget', 'xg', 'corners', 'fouls', 'yellowCards', 'redCards', 'offsides'];
const COUNT_METRICS = STAT_METRICS.filter(metric => metric !== 'possession');
/** Techo honesto por métrica: fuera de rango es error de datos, no récord. */
const MAX_VALUE = { shots: 40, shotsOnTarget: 20, xg: 8, corners: 25, fouls: 30, yellowCards: 8, redCards: 2, offsides: 10 };

const round2 = value => Math.round(value * 100) / 100;
const round3 = value => Math.round(value * 1000) / 1000;
const mean = list => list.reduce((sum, value) => sum + value, 0) / list.length;

/** Filas del histórico donde juega el equipo, más recientes primero. */
export function teamStatRows(history, team, count = 10) {
  return (history ?? [])
    .filter(row => row?.statistics && (sameClub(row.home, team) || sameClub(row.away, team)))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, Math.max(0, count));
}

const ownValues = (rows, team, metric) => rows
  .map(row => (sameClub(row.home, team) ? row.statistics.home : row.statistics.away)?.[metric])
  .filter(value => value != null);
const concededValues = (rows, team, metric) => rows
  .map(row => (sameClub(row.home, team) ? row.statistics.away : row.statistics.home)?.[metric])
  .filter(value => value != null);

/** Media de la competición por partido y equipo; null sin filas con dato. */
export function leagueAverage(history, competition, metric) {
  const pool = [];
  for (const row of history ?? []) {
    if (competition != null && row?.competition !== competition) continue;
    for (const side of ['home', 'away']) {
      const value = row?.statistics?.[side]?.[metric];
      if (value != null) pool.push(value);
    }
  }
  return pool.length ? mean(pool) : null;
}

/**
 * Valor esperado de una métrica de conteo para un equipo en un partido.
 * (propio + lo que concede el rival) / 2, encogido a la media de la liga.
 */
export function forecastCount({ ownRows, oppRows, leagueAvg, min = 3, shrink = 4, max = Infinity }) {
  const n = Math.min(ownRows.length, oppRows.length);
  if (n < min || ownRows.length < min || oppRows.length < min) return null;
  const raw = (mean(ownRows) + mean(oppRows)) / 2;
  const base = leagueAvg ?? raw;
  const weight = n / (n + shrink);
  return round2(Math.min(max, Math.max(0, weight * raw + (1 - weight) * base)));
}

/**
 * Pronóstico completo de las 9 métricas para un encuentro.
 * Devuelve `{ method, home, away, sample, coverage, league, source }`
 * con null por métrica sin muestra; null entero si ningún lado tiene filas.
 */
export function forecastStats(history, home, away, { competition = null, count = 10, min = 3, shrink = 4 } = {}) {
  const homeRows = teamStatRows(history, home, count);
  const awayRows = teamStatRows(history, away, count);
  if (!homeRows.length || !awayRows.length) return null;
  const league = {};
  for (const metric of STAT_METRICS) league[metric] = leagueAverage(history, competition, metric) ?? leagueAverage(history, null, metric);
  const side = (team, teamRows, oppRows) => {
    const out = {};
    for (const metric of COUNT_METRICS) {
      out[metric] = forecastCount({
        ownRows: ownValues(teamRows, team, metric),
        oppRows: concededValues(oppRows, team === home ? away : home, metric),
        leagueAvg: league[metric], min, shrink, max: MAX_VALUE[metric] ?? Infinity,
      });
    }
    return out;
  };
  // Posesión como reparto: se normaliza a 100 entre ambos.
  const possessionOf = team => {
    const rows = team === home ? homeRows : awayRows;
    const values = ownValues(rows, team, 'possession');
    if (values.length < min) return null;
    const base = league.possession ?? 50;
    const weight = values.length / (values.length + shrink);
    return weight * mean(values) + (1 - weight) * base;
  };
  const homePoss = possessionOf(home);
  const awayPoss = possessionOf(away);
  const homeOut = side(home, homeRows, awayRows);
  const awayOut = side(away, awayRows, homeRows);
  if (homePoss != null && awayPoss != null && homePoss + awayPoss > 0) {
    homeOut.possession = round2(Math.min(95, Math.max(5, (homePoss / (homePoss + awayPoss)) * 100)));
    awayOut.possession = round2(Math.min(95, Math.max(5, (awayPoss / (homePoss + awayPoss)) * 100)));
  } else {
    homeOut.possession = null;
    awayOut.possession = null;
  }
  const coverage = {};
  for (const [key, team, teamRows] of [['home', home, homeRows], ['away', away, awayRows]]) {
    coverage[key] = {};
    for (const metric of STAT_METRICS) coverage[key][metric] = ownValues(teamRows, team, metric).length;
  }
  return {
    method: 'stats-ratings-v1',
    home: homeOut, away: awayOut,
    sample: { home: homeRows.length, away: awayRows.length },
    coverage,
    league: Object.fromEntries(STAT_METRICS.map(metric => [metric, league[metric] == null ? null : round2(league[metric])])),
    source: 'GoatLab',
  };
}

/* ---- Comparativas frente a frente (duelos) ---- */

/** Duelo 1X2 entre dos ritmos Poisson: P(local >) / P(=) / P(visita >). */
export function threeWay(homeLambda, awayLambda, { max = 20 } = {}) {
  if (!Number.isFinite(homeLambda) || !Number.isFinite(awayLambda) || homeLambda < 0 || awayLambda < 0) return null;
  const home = goalDistribution(Math.min(8, homeLambda), max);
  const away = goalDistribution(Math.min(8, awayLambda), max);
  let homeWin = 0, draw = 0, awayWin = 0;
  for (let h = 0; h < home.length; h++) {
    for (let a = 0; a < away.length; a++) {
      const p = home[h] * away[a];
      if (h > a) homeWin += p; else if (h === a) draw += p; else awayWin += p;
    }
  }
  const total = homeWin + draw + awayWin;
  if (total <= 0) return null;
  return { home: round3(homeWin / total), draw: round3(draw / total), away: round3(awayWin / total) };
}

/**
 * Último gol por relojes en competencia: dado el reparto (n, m), el último
 * es local con prob. n/(n+m); se integra sobre la Poisson conjunta.
 */
export function lastGoal(homeLambda, awayLambda, { max = 12 } = {}) {
  if (!Number.isFinite(homeLambda) || !Number.isFinite(awayLambda) || homeLambda < 0 || awayLambda < 0) return null;
  if (homeLambda + awayLambda <= 0) return null;
  const home = goalDistribution(homeLambda, max);
  const away = goalDistribution(awayLambda, max);
  let firstHome = 0, firstAway = 0;
  for (let h = 0; h < home.length; h++) {
    for (let a = 0; a < away.length; a++) {
      if (h === 0 && a === 0) continue;
      const p = home[h] * away[a];
      firstHome += (p * h) / (h + a);
      firstAway += (p * a) / (h + a);
    }
  }
  const noGoal = home[0] * away[0];
  const total = firstHome + firstAway + noGoal;
  if (total <= 0) return null;
  return { home: round3(firstHome / total), away: round3(firstAway / total), noGoal: round3(noGoal / total) };
}

/** Binomial negativa: prob. de llegar primero a N con ritmos a y b. */
export function raceTo(homeRate, awayRate, target) {
  if (!Number.isFinite(homeRate) || !Number.isFinite(awayRate) || homeRate <= 0 || awayRate <= 0) return null;
  if (!Number.isInteger(target) || target < 1) return null;
  const choose = (n, k) => {
    let out = 1;
    for (let i = 1; i <= k; i++) out = (out * (n - k + i)) / i;
    return out;
  };
  const p = homeRate / (homeRate + awayRate);
  let home = 0;
  for (let k = 0; k < target; k++) home += choose(target + k - 1, k) * p ** target * (1 - p) ** k;
  return { home: round3(home), away: round3(1 - home) };
}

/** Margen de córners por bandas: +3, +1/+2, iguales, −1/−2, −3 o más. */
export function cornerMargin(homeLambda, awayLambda, { max = 20 } = {}) {
  if (!Number.isFinite(homeLambda) || !Number.isFinite(awayLambda) || homeLambda < 0 || awayLambda < 0) return null;
  const home = goalDistribution(Math.min(8, homeLambda), max);
  const away = goalDistribution(Math.min(8, awayLambda), max);
  const bands = { home3plus: 0, home12: 0, level: 0, away12: 0, away3plus: 0 };
  let total = 0;
  for (let h = 0; h < home.length; h++) {
    for (let a = 0; a < away.length; a++) {
      const p = home[h] * away[a];
      total += p;
      const diff = h - a;
      if (diff >= 3) bands.home3plus += p;
      else if (diff >= 1) bands.home12 += p;
      else if (diff === 0) bands.level += p;
      else if (diff >= -2) bands.away12 += p;
      else bands.away3plus += p;
    }
  }
  if (total <= 0) return null;
  return Object.fromEntries(Object.entries(bands).map(([key, value]) => [key, round3(value / total)]));
}

/**
 * Bloque de dominancia para hornear: duelos y carreras derivados de los
 * ritmos pronosticados (córners, amarillas) y de los λ de gol. Cada pieza
 * nula por separado cuando su insumo falta.
 */
export function forecastDominance({ corners = null, yellows = null, goalLambdas = null } = {}) {
  const cornersDuel = corners ? threeWay(corners.home, corners.away, { max: 20 }) : null;
  const cardsDuel = yellows ? threeWay(yellows.home, yellows.away, { max: 10 }) : null;
  const last = goalLambdas ? lastGoal(goalLambdas.home, goalLambdas.away) : null;
  const raceTargets = [3, 5, 7];
  const race = corners
    ? Object.fromEntries(raceTargets.map(target => [target, raceTo(corners.home, corners.away, target)]))
    : null;
  const margin = corners ? cornerMargin(corners.home, corners.away) : null;
  if (!cornersDuel && !cardsDuel && !last && !race && !margin) return null;
  return { method: 'dominance-v1', cornersDuel, cardsDuel, lastGoal: last, cornerRace: race, cornerMargin: margin, source: 'GoatLab' };
}
