/**
 * Probability scenario engine (build time, no LLM).
 *
 * Independent Poisson + Dixon-Coles correction over a scoreline matrix;
 * every derivable scenario comes from the same matrix. "When" is modeled
 * as a Poisson process in time (exponential clocks at λ/90 per minute):
 * the first-goal race and its bands come from exp(−Λ·t/90). Scorers
 * share the team's real goal split (player share × team λ).
 * First goal and scorers use blended λ (local Poisson + Bzzoiro xG in equal
 * parts when both exist) so they do not contradict the provider; the result
 * stays pure Poisson and the `derivado-xG-Bzzoiro` witness is kept apart.
 * No odds or betting-house vocabulary: probabilities and values.
 * Anything not derivable from the data stays null and the interface omits it.
 */
import { goalDistribution, estimateLambdas, teamRates } from './predictions.js';
import { sameClub, normalize } from './teams.js';

/** Dixon-Coles ρ: negative would inflate 0-0/1-1... the classic convention uses ρ<0 with these signs. */
const DC_RHO = -0.1;
const MAX_GOALS = 8;
const BANDS = [[0, 15], [15, 30], [30, 45], [45, 60], [60, 75], [75, 90]];

const round = (value, digits = 3) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/** Scoreline matrix with Dixon-Coles correction in low-score cells. */
export function scoreMatrix(homeLambda, awayLambda, { max = MAX_GOALS, rho = DC_RHO } = {}) {
  const home = goalDistribution(homeLambda, max);
  const away = goalDistribution(awayLambda, max);
  const tau = (h, a) => {
    if (h === 0 && a === 0) return 1 - homeLambda * awayLambda * rho;
    if (h === 0 && a === 1) return 1 + homeLambda * rho;
    if (h === 1 && a === 0) return 1 + awayLambda * rho;
    if (h === 1 && a === 1) return 1 - rho;
    return 1;
  };
  const matrix = [];
  for (let h = 0; h <= max; h++) {
    const row = [];
    for (let a = 0; a <= max; a++) row.push(Math.max(0, home[h] * away[a] * tau(h, a)));
    matrix.push(row);
  }
  return matrix;
}

/** All scoreline markets derived from the (normalized) matrix. */
export function matrixMarkets(matrix, { exactScores = 5 } = {}) {
  let homeWin = 0, draw = 0, awayWin = 0, over15 = 0, over25 = 0, over35 = 0, both = 0, total = 0;
  const scores = [];
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      const p = matrix[h][a];
      total += p;
      if (h > a) homeWin += p; else if (h === a) draw += p; else awayWin += p;
      if (h + a > 1) over15 += p;
      if (h + a > 2) over25 += p;
      if (h + a > 3) over35 += p;
      if (h > 0 && a > 0) both += p;
      scores.push({ home: h, away: a, p });
    }
  }
  if (total <= 0) return null;
  const winRate = homeWin / total, drawRate = draw / total, awayRate = awayWin / total;
  const dnbHome = winRate / (winRate + awayRate || 1);
  return {
    oneX2: { home: round(winRate), draw: round(drawRate), away: round(awayRate) },
    doubleChance: { '1X': round(winRate + drawRate), X2: round(drawRate + awayRate), '12': round(winRate + awayRate) },
    dnb: { home: round(dnbHome), away: round(1 - dnbHome) },
    totals: {
      over15: round(over15 / total), under15: round(1 - over15 / total),
      over25: round(over25 / total), under25: round(1 - over25 / total),
      over35: round(over35 / total), under35: round(1 - over35 / total),
    },
    btts: { yes: round(both / total), no: round(1 - both / total) },
    // clean sheet: home = sum of column a=0 (away does not score); away = row h=0.
    cleanSheet: {
      home: round(matrix.reduce((sum, row) => sum + row[0], 0) / total),
      away: round(matrix[0].reduce((sum, cell) => sum + cell, 0) / total),
    },
    exactScores: scores.sort((a, b) => b.p - a.p).slice(0, exactScores).map(score => ({ home: score.home, away: score.away, p: round(score.p) })),
  };
}

/** First-goal race: Poisson clocks at λ/90 per minute. */
export function firstGoalRace(homeLambda, awayLambda) {
  const lambdaTotal = homeLambda + awayLambda;
  if (lambdaTotal <= 0) return null;
  const noGoal = Math.exp(-lambdaTotal);
  const bands = BANDS.map(([from, to]) => ({
    from, to,
    p: round(Math.exp(-lambdaTotal * from / 90) - Math.exp(-lambdaTotal * to / 90)),
  }));
  return {
    lambdaTotal: round(lambdaTotal, 2),
    noGoal: round(noGoal),
    bands,
    firstHome: round((homeLambda / lambdaTotal) * (1 - noGoal)),
    firstAway: round((awayLambda / lambdaTotal) * (1 - noGoal)),
  };
}

/** Each listed scorer's share of the team's real season goals. */
export function scorerShares(scorers, team, teamGoalsFor, { top = 3 } = {}) {
  const rows = (scorers ?? []).filter(row => sameClub(row.team, team) && Number.isFinite(row.value) && row.value > 0);
  if (!rows.length) return null;
  const base = Number.isFinite(teamGoalsFor) && teamGoalsFor > 0 ? teamGoalsFor : rows.reduce((sum, row) => sum + row.value, 0);
  if (!base) return null;
  return rows.sort((a, b) => b.value - a.value).slice(0, top).map(row => ({
    player: row.player,
    goals: row.value,
    matches: row.matches ?? null,
    share: round(Math.min(0.9, row.value / base)),
  }));
}

/** Scorer markets from team share × λ (Poisson process). */
export function scorerMarkets(shares, teamLambda, lambdaTotal) {
  if (!shares?.length || !lambdaTotal) return null;
  return shares.map(entry => {
    const rate = teamLambda * entry.share;
    return {
      ...entry,
      rate: round(rate, 2),
      anytime: round(1 - Math.exp(-rate)),
      first: round(rate / lambdaTotal),
    };
  });
}

/**
 * 100% split among the favorites to open the scoreline (view, top 5).
 * Joins both sides, sorts by `first` and renormalizes: `split = first / Σfirst₅`.
 * The JSON keeps absolute values; this is conditional ("if one of these
 * five opens it"). Honest null when there are no rows or the sum is zero.
 * `leftover = 1 − noGoal − Σfirst₅`: what stays outside the row (zero + rest).
 */
export function topScorerSplit(scorerRows, { top = 5, noGoal = null } = {}) {
  const all = ['home', 'away'].flatMap(side =>
    (scorerRows?.[side] ?? []).map(row => ({ ...row, side })));
  const picked = all
    .filter(row => Number.isFinite(row.first) && row.first > 0)
    .sort((a, b) => b.first - a.first)
    .slice(0, Math.max(1, top));
  const sum = picked.reduce((total, row) => total + row.first, 0);
  if (!picked.length || !(sum > 0)) return null;
  return {
    rows: picked.map(row => ({ ...row, split: round(row.first / sum) })),
    leftover: noGoal != null ? Math.max(0, round(1 - noGoal - sum)) : null,
  };
}

/** Blended λ for the first goal: equal-parts mean of local Poisson + Bzzoiro xG.
 *  Null when either is missing; the caller keeps pure Poisson for the markets. */
export function blendLambdas(poisson, xg) {
  if (!poisson || !xg) return null;
  if (!Number.isFinite(poisson.home) || !Number.isFinite(poisson.away)) return null;
  if (!Number.isFinite(xg.home) || !Number.isFinite(xg.away) || xg.home <= 0 || xg.away <= 0) return null;
  return {
    home: clipLambda((poisson.home + xg.home) / 2),
    away: clipLambda((poisson.away + xg.away) / 2),
  };
}

/**
 * Reusable scorer block: from the leaderboard (or its fallback) to
 * per-team markets. Returns `{ scorers, hasScorers }`; honest null
 * when there are no rows or lambdas to split.
 */
export function buildScorerMarkets({ match, scorers = null, standings = null, raceLambdas = null, lambdaTotal = null } = {}) {
  const empty = { scorers: { home: null, away: null }, hasScorers: false };
  if (!match?.home || !match?.away || !raceLambdas || !lambdaTotal) return empty;
  const leagueScorers = scorers?.scorers ?? null;
  const homeStandings = standingsRow(standings, match.competition, match.home);
  const awayStandings = standingsRow(standings, match.competition, match.away);
  const homeShares = scorerShares(leagueScorers, match.home, homeStandings?.goalsFor ?? null);
  const awayShares = scorerShares(leagueScorers, match.away, awayStandings?.goalsFor ?? null);
  const markets = {
    home: scorerMarkets(homeShares, raceLambdas.home, lambdaTotal),
    away: scorerMarkets(awayShares, raceLambdas.away, lambdaTotal),
  };
  return { scorers: markets, hasScorers: Boolean(markets.home?.length || markets.away?.length) };
}

/**
 * Merges the league leaderboard with the squad fallback: the
 * leaderboard leads per team; only teams without rows take the
 * fallback (Bzzoiro squad / AF topscorers). It never mixes both for the
 * same team.
 */
export function mergeScorerFallback(base, fallback) {
  const baseRows = base?.scorers ?? [];
  const fallbackRows = fallback?.scorers ?? [];
  if (!fallbackRows.length) return base;
  const covered = new Set(baseRows.map(row => normalize(row.team)));
  const extra = fallbackRows.filter(row => row?.team && !covered.has(normalize(row.team)));
  if (!extra.length) return base;
  return { ...base, scorers: [...baseRows, ...extra], fallbackSource: fallback.provider ?? 'Bzzoiro-squad' };
}

/** Applies `mergeScorerFallback` per competition; without fallback it returns the base untouched. */
export function withScorerFallback(scorersBase = {}, scorerFallback = {}) {
  const comps = new Set([...Object.keys(scorersBase ?? {}), ...Object.keys(scorerFallback ?? {})]);
  return Object.fromEntries([...comps].map(comp => [comp, mergeScorerFallback(scorersBase?.[comp] ?? null, scorerFallback?.[comp] ?? null)]));
}
/**
 * Full markets for a fixture from already baked data.
 * Each group declares `enough` so the interface omits weak ones.
 * Honest null: without 3 previous results per side there is no local Poisson.
 * First goal and scorers use the blend when provider xG exists;
 * `lambdas` keeps pure Poisson (markets) and `lambdasBlend` declares the one used.
 */
export function computeMatchMarkets({ match, results = [], scorers = null, standings = null } = {}) {
  const lambdas = estimateLambdas(results, match.home, match.away);
  if (!lambdas) return null;
  const matrix = scoreMatrix(lambdas.home, lambdas.away);
  const markets = matrixMarkets(matrix);
  const xg = match?.modelPrediction?.xg;
  const lambdasBlend = blendLambdas(lambdas, xg);
  const raceLambdas = lambdasBlend ?? lambdas;
  const race = firstGoalRace(raceLambdas.home, raceLambdas.away);
  const { scorers: scorersMarkets, hasScorers } = buildScorerMarkets({ match, scorers, standings, raceLambdas, lambdaTotal: race?.lambdaTotal });
  return {
    method: lambdasBlend ? 'poisson-blend-v1' : 'poisson-dixoncoles-v1',
    lambdas,
    lambdasBlend: lambdasBlend ?? null,
    lambdaSource: 'Poisson',
    firstGoalSource: lambdasBlend ? 'Blend Poisson+xG' : 'Poisson',
    markets,
    firstGoal: race,
    scorers: scorersMarkets,
    scorerSource: hasScorers ? (scorers?.fallbackSource ? `fallback-${scorers.fallbackSource}` : 'leaderboard') : null,
    sample: {
      home: teamRates(results, match.home)?.played ?? 0,
      away: teamRates(results, match.away)?.played ?? 0,
    },
    hasScorers,
  };
}

/* ---- Always-emit cascade (zero tolerance in the 5 sections) ---- */

const LEAGUE_AVG_LAMBDA = { home: 1.45, away: 1.45 };
const clipLambda = v => Math.min(4.5, Math.max(0.15, Math.round(v * 1000) / 1000));

/**
 * λ with declared provenance: local Poisson → Bzzoiro xG → league mean.
 * Never null when there are team names; the caller labels the source.
 */
export function resolveLambdas({ match, results = [] } = {}) {
  const local = estimateLambdas(results, match?.home, match?.away);
  if (local) return { ...local, source: 'Poisson' };
  const xg = match?.modelPrediction?.xg;
  if (Number.isFinite(xg?.home) && Number.isFinite(xg?.away) && xg.home > 0 && xg.away > 0) {
    return { home: clipLambda(xg.home), away: clipLambda(xg.away), source: 'Bzzoiro-xG' };
  }
  return { ...LEAGUE_AVG_LAMBDA, source: 'Media-liga' };
}

/** Same calculation as computeMatchMarkets but with cascade λ: never null for lack of sample.
 *  Scorers are also attempted (leaderboard or its squad fallback);
 *  without rows, the view falls back to the per-team split (Level 4, local Poisson). */
export function resolveMatchMarkets({ match, results = [], scorers = null, standings = null } = {}) {
  const direct = computeMatchMarkets({ match, results, scorers, standings });
  if (direct) return direct;
  if (!match?.home || !match?.away) return null;
  const lambdas = resolveLambdas({ match, results });
  const matrix = scoreMatrix(lambdas.home, lambdas.away);
  const markets = matrixMarkets(matrix);
  const race = firstGoalRace(lambdas.home, lambdas.away);
  if (!markets || !race) return null;
  const { scorers: scorersMarkets, hasScorers } = buildScorerMarkets({
    match, scorers, standings,
    raceLambdas: { home: lambdas.home, away: lambdas.away },
    lambdaTotal: race.lambdaTotal,
  });
  return {
    method: lambdas.source === 'Poisson' ? 'poisson-dixoncoles-v1' : 'poisson-fallback-v1',
    lambdas: { home: lambdas.home, away: lambdas.away },
    lambdaSource: lambdas.source,
    firstGoalSource: lambdas.source === 'Poisson' ? 'Poisson' : lambdas.source === 'Bzzoiro-xG' ? 'Bzzoiro-xG' : 'Media-liga',
    markets,
    firstGoal: race,
    scorers: scorersMarkets,
    scorerSource: hasScorers ? (scorers?.fallbackSource ? `fallback-${scorers.fallbackSource}` : 'leaderboard') : null,
    sample: { home: 0, away: 0 },
    hasScorers,
  };
}

/**
 * Weight of the provider's chosen scoreline: its `most_likely` anchors the
 * podium with `PROVIDER_PICK_BOOST` over the matrix's best probability.
 * Global rule (all matches): ensures the pick opens with a margin
 * without per-match recalibration. Absolute `p` is kept for audit;
 * `share` is the 100-point split among the 5 shown, which is what the reader sees.
 */
export const PROVIDER_PICK_BOOST = 1.25;

/**
 * Markets derived from provider xG (Bzzoiro) with the same Poisson–Dixon-Coles
 * matrix as the own engine. Covers what the provider does not
 * publish as % (clean sheet, exact-score table); provenance
 * `derivado-xG-Bzzoiro` distinguishes it from the local-sample calculation.
 */
export function marketsFromXg(xg, mostLikely = null) {
  if (!Number.isFinite(xg?.home) || !Number.isFinite(xg?.away) || xg.home <= 0 || xg.away <= 0) return null;
  const matrix = scoreMatrix(clipLambda(xg.home), clipLambda(xg.away));
  const markets = matrixMarkets(matrix);
  if (!markets) return null;
  const exact = markets.exactScores.map(score => ({ ...score }));
  let providerPick = null;
  if (typeof mostLikely === 'string') {
    const pick = mostLikely.split('-').map(Number);
    if (pick.length === 2 && pick.every(Number.isInteger)) {
      const found = exact.findIndex(score => score.home === pick[0] && score.away === pick[1]);
      if (found >= 0) exact.splice(found, 1);
      else exact.pop();
      const top = Math.max(...exact.map(score => score.p));
      providerPick = { home: pick[0], away: pick[1], p: round(top * PROVIDER_PICK_BOOST) };
      exact.unshift(providerPick);
    }
  }
  const five = exact.slice(0, 5);
  const sum = five.reduce((total, score) => total + score.p, 0);
  const withShare = five.map(score => ({ ...score, share: sum > 0 ? score.p / sum : 0 }));
  return { ...markets, exactScores: withShare, providerPick: providerPick ? { home: providerPick.home, away: providerPick.away } : null, method: 'poisson-xg-bzzoiro-v1', source: 'derivado-xG-Bzzoiro' };
}

/**
 * Estimated discipline: own rates when there is sample; otherwise,
 * the Over 3.5 yellows market translates to "~X expected".
 * Never invents %: without input it returns the honest-null stub.
 */
export function buildDisciplineEstimate({ statsForecast = null, marketCards = null, scorers = null, historyRows = 0 } = {}) {
  const base = buildDisciplineStub({ scorers, historyRows });
  const yh = statsForecast?.home?.yellowCards;
  const ya = statsForecast?.away?.yellowCards;
  if (yh != null && ya != null) {
    const total = Math.round((yh + ya) * 10) / 10;
    return { ...base, method: 'stats-ratings-v1', expectedTotal: total, source: 'GoatLab' };
  }
  if (marketCards?.over35 != null) {
    // Interpretive conversion: higher % of going over 3.5 means a higher expected value (2.5–5.5).
    const expected = Math.round((2.5 + marketCards.over35 * 3) * 10) / 10;
    return { ...base, method: 'mercado-estimado-v1', expectedTotal: expected, over35: marketCards.over35, source: 'Mercado' };
  }
  return base;
}

/** Estimated corners with the same rule: rates → Over 9.5 market. */
export function buildSetPiecesEstimate({ statsForecast = null, marketCorners = null, cornersSource = null, historyRows = 0 } = {}) {
  const base = buildSetPiecesStub({ historyRows });
  const ch = statsForecast?.home?.corners;
  const ca = statsForecast?.away?.corners;
  if (ch != null && ca != null) {
    return { ...base, method: 'stats-ratings-v1', expectedTotal: Math.round((ch + ca) * 10) / 10, source: 'GoatLab' };
  }
  if (marketCorners?.over95 != null) {
    const expected = Math.round((7 + marketCorners.over95 * 5) * 10) / 10;
    return { ...base, method: 'mercado-estimado-v1', expectedTotal: expected, over95: marketCorners.over95, source: cornersSource ?? 'Mercado' };
  }
  return base;
}

function standingsRow(standings, competitionId, team) {
  const rows = standings?.[competitionId]?.rows;
  if (!Array.isArray(rows)) return null;
  return rows.find(row => sameClub(row.team, team)) ?? null;
}

/* ---- Per-team context (page closing cards) ---- */

const RECENT = 5;

/** Cup or international competitions: never "their league". */
const CUP_COMPETITIONS = new Set(['champions', 'europa', 'libertadores', 'nations']);

/**
 * Team's domestic league: first standings competition that contains it and
 * is not a cup. Null when unresolved (the team is out of coverage).
 */
export function domesticLeague(standingsByLeague, team) {
  for (const [competitionId, table] of Object.entries(standingsByLeague ?? {})) {
    if (CUP_COMPETITIONS.has(competitionId)) continue;
    const rows = table?.rows;
    if (Array.isArray(rows) && rows.some(row => sameClub(row.team, team))) return competitionId;
  }
  return null;
}

/** One context: last 5 in their domestic league. Without prior matches, debut (0 played). */
export function teamContext(resultsBase, standingsByLeague, scorersByLeague, match, side) {
  const team = side === 'home' ? match.home : match.away;
  // "Their league": the domestic league when it resolves; otherwise the
  // match competition (previous behavior). Rows without a declared
  // competition do not count: the label allows no doubt.
  const league = domesticLeague(standingsByLeague, team) ?? match.competition;
  const recent = (resultsBase ?? []).filter(row => row.homeScore != null && row.competition === league && (sameClub(row.home, team) || sameClub(row.away, team)))
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, RECENT);
  const scored = row => sameClub(row.home, team) ? row.homeScore : row.awayScore;
  const conceded = row => sameClub(row.home, team) ? row.awayScore : row.homeScore;
  const debut = recent.length === 0;
  const cleanSheets = debut ? null : { value: recent.filter(row => conceded(row) === 0).length, sample: recent.length };
  const biggestRaw = recent.reduce((best, row) => Math.max(best, scored(row) - conceded(row)), 0);
  const biggestWin = !debut && biggestRaw > 0 ? { value: biggestRaw, sample: recent.length } : null;
  let unbeaten = 0;
  for (const row of recent) {
    if (scored(row) === conceded(row) || scored(row) > conceded(row)) unbeaten += 1; else break;
  }
  const standings = standingsRow(standingsByLeague, league, team);
  const scorer = (scorersByLeague?.[league]?.scorers ?? scorersByLeague?.scorers ?? []).filter(row => sameClub(row.team, team)).sort((a, b) => b.value - a.value)[0] ?? null;
  const matchPlayer = (match.playerStats?.[side] ?? [])[0] ?? null;
  return {
    team,
    recentSample: recent.length,
    debut,
    cleanSheets,
    biggestWin,
    unbeaten: debut ? null : { value: unbeaten, sample: recent.length },
    season: standings ? { position: standings.position, played: standings.played, gf: standings.goalsFor, ga: standings.goalsAgainst, provider: standingsByLeague.provider ?? null } : null,
    player: matchPlayer
      ? { name: matchPlayer.name, detail: matchPlayer.rating != null ? `rating ${matchPlayer.rating}` : (matchPlayer.goals != null ? `${matchPlayer.goals} gol(es)` : null), source: 'del último partido con registro' }
      : scorer
        ? { name: scorer.player, detail: scorer.value != null ? `${scorer.value} goles${scorer.matches ? ` en ${scorer.matches} partidos` : ''}` : null, source: 'líder del equipo en la temporada' }
        : null,
  };
}

/* ---- Extended blocks (provider echo + honest-null stubs) ---- */

/**
 * Direct echo of `match.modelPrediction` (Bzzoiro): no own calculation.
 * Always a stable object; `source:null` when there is no capture.
 */
export function buildProviderEcho(match) {
  const raw = match?.modelPrediction ?? null;
  return {
    oneX2: raw?.oneX2 ?? null,
    xg: raw?.xg ?? null,
    over15: raw?.over15 ?? null,
    over25: raw?.over25 ?? null,
    over35: raw?.over35 ?? null,
    btts: raw?.btts ?? null,
    score: raw?.score ?? null,
    cornersOver95: raw?.cornersOver95 ?? null,
    recommendations: raw?.recommendations ?? null,
    confidence: raw?.confidence ?? null,
    model: raw?.model ?? null,
    capturedAt: raw?.capturedAt ?? null,
    source: raw ? (raw.source ?? 'Bzzoiro') : null,
  };
}

/** Direct echo of `match.h2h` (Bzzoiro); `recent` capped at 5. */
export function buildH2hEcho(match) {
  const raw = match?.h2h ?? null;
  return {
    totalMatches: raw?.totalMatches ?? null,
    homeWins: raw?.homeWins ?? null,
    draws: raw?.draws ?? null,
    awayWins: raw?.awayWins ?? null,
    avgTotalGoals: raw?.avgTotalGoals ?? null,
    recent: Array.isArray(raw?.recent) ? raw.recent.slice(0, 5) : null,
    source: raw ? (raw.source ?? 'Bzzoiro') : null,
  };
}

/** Discipline stub: the cards Poisson model lives here once evaluated. */
export function buildDisciplineStub({ scorers = null, historyRows = 0 } = {}) {
  const side = () => ({ yellowOver35: null, redAnytime: null, foulsAvg: null });
  return {
    method: 'poisson-cards-v0',
    home: side(),
    away: side(),
    sample: { scorers: Array.isArray(scorers) ? scorers.length : 0, historyRows },
    source: null,
  };
}

/** Set-piece stub: the own corners/shots/xG model lives here. */
export function buildSetPiecesStub({ historyRows = 0 } = {}) {
  return {
    method: 'poisson-corners-v0',
    cornersOver95: null,
    shots: null,
    xgTotal: null,
    sample: { historyRows },
    source: null,
  };
}

/**
 * Weather + venue per match. `weatherEntry` is the `weather.json[id]` sidecar;
 * `venue` is `locateMatch(match)` resolved by the pipeline (avoids importing venues here).
 */
export function buildWeatherVenue({ match, weatherEntry = null, venue = null } = {}) {
  return {
    weather: {
      temp: weatherEntry?.temp ?? null,
      precipitation: weatherEntry?.precipitation ?? null,
      weathercode: weatherEntry?.weathercode ?? null,
      wind: weatherEntry?.wind ?? null,
      condition: weatherEntry?.condition ?? null,
      sampledAt: weatherEntry?.sampledAt ?? null,
      source: weatherEntry?.source ?? null,
    },
    venue: {
      stadium: venue?.stadium ?? match?.venue ?? null,
      city: venue?.city ?? match?.venueCity ?? null,
      capacity: venue?.capacity ?? null,
      tz: venue?.tz ?? null,
    },
    referee: null,
    pitch: null,
    attendance: null,
    derby: null,
    neutral: null,
    travelKm: null,
  };
}

/** Availability from `match.lineups` (Bzzoiro); confirmed absences, never estimated. */
export function buildAvailability(match) {
  const raw = match?.lineups ?? null;
  return {
    status: raw?.status ?? null,
    unavailablePlayers: raw?.unavailablePlayers ?? null,
    source: raw ? (raw.source ?? 'Bzzoiro') : null,
  };
}

// Re-exportations used by scripts and tests.
export { estimateLambdas, normalize };
