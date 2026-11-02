/**
 * Match statistics forecast (build time, no LLM).
 *
 * Mirror of `estimateLambdas` for the 9 scorecard metrics: each team's expected
 * value comes from its own average + what the opponent concedes,
 * shrunk to the competition mean on a short sample. Without enough
 * sample the metric stays null and the view omits it: never invented.
 * `forecastStatsFull` is the always-full table variant: same formula with
 * a minimum of 1 match, AF fill per metric and the mean as support; the xG
 * column is anchored to the Bzzoiro model's xG.
 * Comparisons (1X2 duels, last goal, corner race, margin) are
 * derived from the same rates with independent Poisson.
 */
import { sameClub } from './teams.js';
import { goalDistribution } from './predictions.js';

export const STAT_METRICS = ['possession', 'shots', 'shotsOnTarget', 'xg', 'corners', 'fouls', 'yellowCards', 'redCards', 'offsides'];
const COUNT_METRICS = STAT_METRICS.filter(metric => metric !== 'possession');
/** Honest ceiling per metric: out of range is a data error, not a record. */
const MAX_VALUE = { shots: 40, shotsOnTarget: 20, xg: 8, corners: 25, fouls: 30, yellowCards: 8, redCards: 2, offsides: 10 };
/** Expected yellows that trigger the disciplinary criterion (see below). */
const MANY_YELLOWS = 3.5;
/** Red-card floor when the criterion applies: at least one. */
const RED_FLOOR = 1;

const round2 = value => Math.round(value * 100) / 100;
const round3 = value => Math.round(value * 1000) / 1000;
const mean = list => list.reduce((sum, value) => sum + value, 0) / list.length;
/** Friendlies weigh half: they say less about competitive rhythm. Without a signal, official. */
export const FRIENDLY_WEIGHT = 0.5;
export function isFriendlyRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.friendly === true || row.is_friendly === true) return true;
  const fields = [
    row.round, row.round_name, row.competition, row.competition_name,
    row.league, row.league_name, row.tournament, row.tournament_name, row.stage,
  ];
  return fields.some(value => typeof value === 'string' && /friendly|amistoso/i.test(value));
}
export function rowWeight(row) {
  const explicit = row?.weight;
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) return explicit;
  return isFriendlyRow(row) ? FRIENDLY_WEIGHT : 1;
}
const weightedMean = (values, weights) => {
  let sum = 0, total = 0;
  for (let index = 0; index < values.length; index++) {
    const weight = weights?.[index] ?? 1;
    sum += values[index] * weight;
    total += weight;
  }
  return total > 0 ? sum / total : null;
};
/** Friendly weight over the total: with a friendly majority it shrinks more to the mean. */
const friendlyShareOf = rows => {
  let friendly = 0, total = 0;
  for (const row of rows ?? []) {
    const weight = rowWeight(row);
    total += weight;
    if (isFriendlyRow(row)) friendly += weight;
  }
  return total > 0 ? friendly / total : 0;
};

/** Historical rows where the team plays, most recent first. */
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
/** Values with their weight (friendly 0.5, official 1): same selection, any competition. */
const ownWeighted = (rows, team, metric) => {
  const values = [], weights = [];
  for (const row of rows ?? []) {
    const value = (sameClub(row.home, team) ? row.statistics.home : row.statistics.away)?.[metric];
    if (value == null) continue;
    values.push(value);
    weights.push(rowWeight(row));
  }
  return { values, weights };
};
const concededWeighted = (rows, team, metric) => {
  const values = [], weights = [];
  for (const row of rows ?? []) {
    const value = (sameClub(row.home, team) ? row.statistics.away : row.statistics.home)?.[metric];
    if (value == null) continue;
    values.push(value);
    weights.push(rowWeight(row));
  }
  return { values, weights };
};

/** Competition average per match and team; null without rows with data. */
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
 * Expected value of a counting metric for a team in a match.
 * (own + what the opponent concedes) / 2, shrunk to the league mean.
 * With weights (`ownWeights`/`oppWeights`) the mean is weighted: friendlies
 * weigh half and the minimum still requires matches with data.
 */
export function forecastCount({ ownRows, oppRows, ownWeights = null, oppWeights = null, leagueAvg, min = 3, shrink = 4, max = Infinity }) {
  const n = Math.min(ownRows.length, oppRows.length);
  if (n < min || ownRows.length < min || oppRows.length < min) return null;
  const ownMean = weightedMean(ownRows, ownWeights);
  const oppMean = weightedMean(oppRows, oppWeights);
  if (ownMean == null || oppMean == null) return null;
  const raw = (ownMean + oppMean) / 2;
  const base = leagueAvg ?? raw;
  const weight = n / (n + shrink);
  return round2(Math.min(max, Math.max(0, weight * raw + (1 - weight) * base)));
}

/**
 * Full forecast of the 9 metrics for a fixture.
 * Returns `{ method, home, away, sample, coverage, league, source }`
 * with null per metric without sample; entirely null if neither side has rows.
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
  // Possession as a split: normalized to 100 between both.
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

/* ---- Always-full cascade (Bzzoiro → AF → mean) ---- */

const clampMetric = (metric, value) => {
  if (value == null) return null;
  return Math.min(MAX_VALUE[metric] ?? Infinity, Math.max(0, value));
};

/** Average of own AF bags (`bag` or list of bags); null without data. */
function afAverage(bags, metric) {
  if (bags == null) return null;
  const list = Array.isArray(bags) ? bags : [bags];
  const values = list.map(bag => bag?.[metric]).filter(value => typeof value === 'number' && Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Forecast of the 9 metrics with a per-cell cascade for an always-full table:
 * 1) Bzzoiro rates (own + what the opponent concedes, from 1 match,
 * strongly shrunk to the mean; same selection even if not among them,
 * friendlies weigh half); 2) team AF average mixed with the
 * mean; 3) competition mean and then global.
 * `providerXg` anchors the xG column to the Bzzoiro model's xG so it does not
 * contradict its expected result. Minimum coherence: shots on target ≤ shots;
 * with many expected yellows (≥3.5) and no red-card data from any provider,
 * at least one red. Each cell declares its provenance in `sources` (`Bzzoiro`|`AF`|`mean`);
 * `shortSample` flags a short sample or fill. Entirely null only in total
 * emptiness (no rows, no AF and no means): never invented from nothing.
 */
export function forecastStatsFull(history, home, away, { extraRows = [], af = null, providerXg = null, competition = null, count = 10, shrink = 6 } = {}) {
  const seen = new Set();
  const pool = [...(extraRows ?? []), ...(history ?? [])].filter(row => {
    if (!row?.statistics) return false;
    const key = row.eventId ?? `${row.date}|${row.home}|${row.away}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const homeRows = teamStatRows(pool, home, count);
  const awayRows = teamStatRows(pool, away, count);
  const league = {};
  for (const metric of STAT_METRICS) league[metric] = leagueAverage(pool, competition, metric) ?? leagueAverage(pool, null, metric);
  const origins = new Set();
  const sources = { home: {}, away: {} };
  const takeCount = (side, team, teamRows, oppRows, metric) => {
    const own = ownWeighted(teamRows, team, metric);
    const opp = concededWeighted(oppRows, team === home ? away : home, metric);
    // Friendly majority: own rhythm says less, more anchor to the mean.
    const friendlyShare = friendlyShareOf([...teamRows, ...oppRows]);
    const shrinkEff = friendlyShare > 0.5 ? shrink + 2 : shrink;
    const value = forecastCount({
      ownRows: own.values, oppRows: opp.values,
      ownWeights: own.weights, oppWeights: opp.weights,
      leagueAvg: league[metric], min: 1, shrink: shrinkEff, max: MAX_VALUE[metric] ?? Infinity,
    });
    if (value != null) { sources[side][metric] = 'Bzzoiro'; origins.add('Bzzoiro'); return value; }
    const afAvg = afAverage(af?.[side], metric);
    if (afAvg != null) {
      const blended = league[metric] != null ? (afAvg + league[metric]) / 2 : afAvg;
      sources[side][metric] = 'AF'; origins.add('AF');
      return round2(clampMetric(metric, blended));
    }
    if (league[metric] != null) { sources[side][metric] = 'media'; origins.add('media'); return round2(league[metric]); }
    sources[side][metric] = null;
    return null;
  };
  const possessionOf = (side, team, teamRows) => {
    const own = ownWeighted(teamRows, team, 'possession');
    const afAvg = afAverage(af?.[side], 'possession');
    const all = afAvg != null ? [...own.values, afAvg] : own.values;
    const weights = afAvg != null ? [...own.weights, 1] : own.weights;
    if (!all.length) return null;
    const base = league.possession ?? 50;
    const shrinkEff = friendlyShareOf(teamRows) > 0.5 ? shrink + 2 : shrink;
    const weight = all.length / (all.length + shrinkEff);
    return { value: weight * weightedMean(all, weights) + (1 - weight) * base, fromAf: !own.values.length };
  };
  const homePoss = possessionOf('home', home, homeRows);
  const awayPoss = possessionOf('away', away, awayRows);
  const homeOut = {}, awayOut = {};
  for (const metric of COUNT_METRICS) {
    homeOut[metric] = takeCount('home', home, homeRows, awayRows, metric);
    awayOut[metric] = takeCount('away', away, awayRows, homeRows, metric);
  }
  if (homePoss && awayPoss && homePoss.value + awayPoss.value > 0) {
    homeOut.possession = round2(Math.min(95, Math.max(5, (homePoss.value / (homePoss.value + awayPoss.value)) * 100)));
    awayOut.possession = round2(Math.min(95, Math.max(5, (awayPoss.value / (homePoss.value + awayPoss.value)) * 100)));
    sources.home.possession = homePoss.fromAf ? 'AF' : 'Bzzoiro';
    sources.away.possession = awayPoss.fromAf ? 'AF' : 'Bzzoiro';
    origins.add(homePoss.fromAf || awayPoss.fromAf ? 'AF' : 'Bzzoiro');
  } else if (homePoss || awayPoss) {
    const known = homePoss ?? awayPoss;
    const knownSide = homePoss ? 'home' : 'away';
    const otherSide = homePoss ? 'away' : 'home';
    const kept = round2(Math.min(95, Math.max(5, known.value)));
    if (knownSide === 'home') { homeOut.possession = kept; awayOut.possession = round2(100 - kept); }
    else { awayOut.possession = kept; homeOut.possession = round2(100 - kept); }
    sources[knownSide].possession = known.fromAf ? 'AF' : 'Bzzoiro';
    sources[otherSide].possession = 'media';
    origins.add(known.fromAf ? 'AF' : 'Bzzoiro');
    origins.add('media');
  } else if (league.possession != null) {
    homeOut.possession = round2(league.possession);
    awayOut.possession = round2(100 - league.possession);
    sources.home.possession = 'media';
    sources.away.possession = 'media';
    origins.add('media');
  } else {
    homeOut.possession = null;
    awayOut.possession = null;
    sources.home.possession = null;
    sources.away.possession = null;
  }
  // Anchor xG to the provider model when it provides it (coherence with its expected result).
  let xgSource = null;
  for (const [side, out] of [['home', homeOut], ['away', awayOut]]) {
    const anchored = providerXg?.[side];
    if (typeof anchored === 'number' && Number.isFinite(anchored) && anchored > 0) {
      out.xg = round2(clampMetric('xg', anchored));
      sources[side].xg = 'Bzzoiro';
      xgSource = 'Bzzoiro';
    }
  }
  if (!xgSource) xgSource = sources.home.xg === sources.away.xg ? sources.home.xg : [sources.home.xg, sources.away.xg].filter(Boolean).join('+') || null;
  // Minimum coherence: shots on target do not exceed shots.
  for (const out of [homeOut, awayOut]) {
    if (out.shotsOnTarget != null && out.shots != null) out.shotsOnTarget = Math.min(out.shotsOnTarget, out.shots);
  }
  // Disciplinary criterion: many expected yellows without red-card data
  // (neither Bzzoiro nor AF) → at least one (second yellow): the mean underestimates
  // those cases. Never overrides a real measurement from any provider.
  for (const [side, out] of [['home', homeOut], ['away', awayOut]]) {
    if (afAverage(af?.[side], 'redCards') != null) continue;
    if (sources[side].redCards === 'Bzzoiro') continue;
    if (out.yellowCards != null && out.yellowCards >= MANY_YELLOWS) {
      out.redCards = Math.max(out.redCards ?? 0, RED_FLOOR);
      sources[side].redCards = 'regla';
      origins.add('regla');
    }
  }
  const cells = [...Object.values(homeOut), ...Object.values(awayOut)];
  if (!cells.length || cells.every(value => value == null)) return null;
  const coverage = {};
  for (const [key, team, teamRows] of [['home', home, homeRows], ['away', away, awayRows]]) {
    coverage[key] = {};
    for (const metric of STAT_METRICS) coverage[key][metric] = ownValues(teamRows, team, metric).length;
  }
  const shortSample = homeRows.length < 3 || awayRows.length < 3
    || STAT_METRICS.some(metric => sources.home[metric] !== 'Bzzoiro' || sources.away[metric] !== 'Bzzoiro');
  return {
    method: 'stats-ratings-v2',
    home: homeOut, away: awayOut,
    sample: { home: homeRows.length, away: awayRows.length },
    coverage,
    league: Object.fromEntries(STAT_METRICS.map(metric => [metric, league[metric] == null ? null : round2(league[metric])])),
    sources,
    origins: [...origins],
    xgSource,
    shortSample,
    source: origins.size === 1 ? [...origins][0] : [...origins].join('+') || null,
  };
}

/* ---- Head-to-head comparisons (duels) ---- */

/** 1X2 duel between two Poisson rates: P(home >) / P(=) / P(away >). */
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
 * Last goal by competing clocks: given the split (n, m), the last
 * is home with prob. n/(n+m); integrated over the joint Poisson.
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

/** Negative binomial: prob. of reaching N first with rates a and b. */
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

/** Corner margin by bands: +3, +1/+2, equal, −1/−2, −3 or more. */
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
 * Dominance block to bake: duels and races derived from the
 * estimated rates (corners, yellows) and goal λ. Each piece
 * is null separately when its input is missing.
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
