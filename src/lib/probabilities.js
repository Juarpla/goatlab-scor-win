/**
 * Motor de mercados de probabilidad (build time, sin LLM).
 *
 * Poisson independiente + corrección Dixon-Coles sobre una matriz de marcadores;
 * de la misma matriz salen todos los mercados derivables. El "cuándo" se modela
 * como proceso de Poisson en el tiempo (relojes exponenciales a λ/90 por minuto):
 * la carrera del primer gol y sus bandas salen de exp(−Λ·t/90). Los goleadores
 * comparten el reparto real de goles del equipo (share del jugador × λ del equipo).
 * Nada de cuotas ni vocabulario de casas de apuestas: probabilidades y valores.
 * Lo no derivable de los datos queda en null y la interfaz lo omite.
 */
import { goalDistribution, estimateLambdas, teamRates } from './predictions.js';
import { sameClub, normalize } from './teams.js';

/** ρ de Dixon-Coles: negativo inflaría 0-0/1-1... la convención clásica usa ρ<0 con estos signos. */
const DC_RHO = -0.1;
const MAX_GOALS = 8;
const BANDS = [[0, 15], [15, 30], [30, 45], [45, 60], [60, 75], [75, 90]];

const round = (value, digits = 3) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/** Matriz de marcadores con corrección Dixon-Coles en las celdas de bajo marcador. */
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

/** Todos los mercados de marcador derivados de la matriz (normalizada). */
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
    // portería a cero: local = suma de la columna a=0 (visita no anota); visita = fila h=0.
    cleanSheet: {
      home: round(matrix.reduce((sum, row) => sum + row[0], 0) / total),
      away: round(matrix[0].reduce((sum, cell) => sum + cell, 0) / total),
    },
    exactScores: scores.sort((a, b) => b.p - a.p).slice(0, exactScores).map(score => ({ home: score.home, away: score.away, p: round(score.p) })),
  };
}

/** Carrera del primer gol: relojes de Poisson a λ/90 por minuto. */
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

/** share de cada goleador listado sobre los goles reales del equipo en la temporada. */
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

/** Mercados de goleador a partir del share × λ del equipo (proceso de Poisson). */
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
 * Mercados completos de un encuentro a partir de los datos ya horneados.
 * Cada grupo declara `enough` para que la interfaz omita lo débil.
 * Null-honesto: sin 3 resultados previos por lado no hay Poisson local.
 */
export function computeMatchMarkets({ match, results = [], scorers = null, standings = null } = {}) {
  const lambdas = estimateLambdas(results, match.home, match.away);
  if (!lambdas) return null;
  const matrix = scoreMatrix(lambdas.home, lambdas.away);
  const markets = matrixMarkets(matrix);
  const race = firstGoalRace(lambdas.home, lambdas.away);
  const leagueScorers = scorers?.scorers ?? null;
  const homeStandings = standingsRow(standings, match.competition, match.home);
  const awayStandings = standingsRow(standings, match.competition, match.away);
  const homeShares = scorerShares(leagueScorers, match.home, homeStandings?.goalsFor ?? null);
  const awayShares = scorerShares(leagueScorers, match.away, awayStandings?.goalsFor ?? null);
  const scorersMarkets = {
    home: scorerMarkets(homeShares, lambdas.home, race?.lambdaTotal),
    away: scorerMarkets(awayShares, lambdas.away, race?.lambdaTotal),
  };
  return {
    method: 'poisson-dixoncoles-v1',
    lambdas,
    markets,
    firstGoal: race,
    scorers: scorersMarkets,
    sample: {
      home: teamRates(results, match.home)?.played ?? 0,
      away: teamRates(results, match.away)?.played ?? 0,
    },
    hasScorers: Boolean(scorersMarkets.home?.length || scorersMarkets.away?.length),
    lambdaSource: 'Poisson',
  };
}

/* ---- Cascada siempre-emite (tolerancia cero en las 5 secciones) ---- */

const LEAGUE_AVG_LAMBDA = { home: 1.45, away: 1.45 };
const clipLambda = v => Math.min(4.5, Math.max(0.15, Math.round(v * 1000) / 1000));

/**
 * λ con procedencia declarada: Poisson local → xG Bzzoiro → media de liga.
 * Nunca null cuando hay nombres de equipos; el caller etiqueta la fuente.
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

/** Mismo cálculo que computeMatchMarkets pero con λ de la cascada: nunca null por falta de muestra. */
export function resolveMatchMarkets({ match, results = [], scorers = null, standings = null } = {}) {
  const direct = computeMatchMarkets({ match, results, scorers, standings });
  if (direct) return direct;
  if (!match?.home || !match?.away) return null;
  const lambdas = resolveLambdas({ match, results });
  const matrix = scoreMatrix(lambdas.home, lambdas.away);
  const markets = matrixMarkets(matrix);
  const race = firstGoalRace(lambdas.home, lambdas.away);
  if (!markets || !race) return null;
  return {
    method: lambdas.source === 'Poisson' ? 'poisson-dixoncoles-v1' : 'poisson-fallback-v1',
    lambdas: { home: lambdas.home, away: lambdas.away },
    lambdaSource: lambdas.source,
    markets,
    firstGoal: race,
    scorers: { home: null, away: null },
    sample: { home: 0, away: 0 },
    hasScorers: false,
  };
}

/**
 * Disciplina estimada: ritmos propios cuando hay muestra; si no,
 * el mercado Over 3.5 amarillas se traduce a "se esperan ~X".
 * Nunca inventa %: sin insumo devuelve el stub null-honesto.
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
    // Conversión interpretativa: a mayor % de pasar 3.5, mayor esperado (2.5–5.5).
    const expected = Math.round((2.5 + marketCards.over35 * 3) * 10) / 10;
    return { ...base, method: 'mercado-estimado-v1', expectedTotal: expected, over35: marketCards.over35, source: 'Mercado' };
  }
  return base;
}

/** Córners estimados con la misma regla: ritmos → mercado Over 9.5. */
export function buildSetPiecesEstimate({ statsForecast = null, marketCorners = null, historyRows = 0 } = {}) {
  const base = buildSetPiecesStub({ historyRows });
  const ch = statsForecast?.home?.corners;
  const ca = statsForecast?.away?.corners;
  if (ch != null && ca != null) {
    return { ...base, method: 'stats-ratings-v1', expectedTotal: Math.round((ch + ca) * 10) / 10, source: 'GoatLab' };
  }
  if (marketCorners?.over95 != null) {
    const expected = Math.round((7 + marketCorners.over95 * 5) * 10) / 10;
    return { ...base, method: 'mercado-estimado-v1', expectedTotal: expected, over95: marketCorners.over95, source: 'Mercado' };
  }
  return base;
}

function standingsRow(standings, competitionId, team) {
  const rows = standings?.[competitionId]?.rows;
  if (!Array.isArray(rows)) return null;
  return rows.find(row => sameClub(row.team, team)) ?? null;
}

/* ---- Contexto por equipo (tarjetas del cierre de la página) ---- */

const RECENT = 10;

/** Competiciones coperas o internacionales: nunca son "su campeonato". */
const CUP_COMPETITIONS = new Set(['champions', 'europa', 'libertadores']);

/**
 * Liga doméstica del equipo: primera competición de tablas que lo contiene y
 * no es copa. Null cuando no se resuelve (el equipo queda fuera de cobertura).
 */
export function domesticLeague(standingsByLeague, team) {
  for (const [competitionId, table] of Object.entries(standingsByLeague ?? {})) {
    if (CUP_COMPETITIONS.has(competitionId)) continue;
    const rows = table?.rows;
    if (Array.isArray(rows) && rows.some(row => sameClub(row.team, team))) return competitionId;
  }
  return null;
}

/** Datos "rebuscados" pero reales de la base de resultados y la tabla. */
export function teamContext(resultsBase, standingsByLeague, scorersByLeague, match, side) {
  const team = side === 'home' ? match.home : match.away;
  // "Su campeonato": la liga doméstica cuando se resuelve; si no, la
  // competición del partido (comportamiento anterior). Las filas sin
  // competición declarada no cuentan: el rótulo no admite dudas.
  const league = domesticLeague(standingsByLeague, team) ?? match.competition;
  const recent = (resultsBase ?? []).filter(row => row.homeScore != null && row.competition === league && (sameClub(row.home, team) || sameClub(row.away, team)))
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);
  const scored = row => sameClub(row.home, team) ? row.homeScore : row.awayScore;
  const conceded = row => sameClub(row.home, team) ? row.awayScore : row.homeScore;
  const cleanSheets = recent.filter(row => conceded(row) === 0).length;
  const biggestWin = recent.reduce((best, row) => Math.max(best, scored(row) - conceded(row)), 0);
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
    cleanSheets: { value: cleanSheets, sample: recent.length },
    biggestWin: biggestWin > 0 ? { value: biggestWin, sample: recent.length } : null,
    unbeaten: recent.length ? { value: unbeaten, sample: recent.length } : null,
    season: standings ? { position: standings.position, played: standings.played, gf: standings.goalsFor, ga: standings.goalsAgainst, provider: standingsByLeague.provider ?? null } : null,
    player: matchPlayer
      ? { name: matchPlayer.name, detail: matchPlayer.rating != null ? `rating ${matchPlayer.rating}` : (matchPlayer.goals != null ? `${matchPlayer.goals} gol(es)` : null), source: 'del último partido con registro' }
      : scorer
        ? { name: scorer.player, detail: scorer.value != null ? `${scorer.value} goles${scorer.matches ? ` en ${scorer.matches} partidos` : ''}` : null, source: 'líder del equipo en la temporada' }
        : null,
  };
}

/* ---- Bloques extendidos (eco del proveedor + stubs null-honestos) ---- */

/**
 * Eco directo de `match.modelPrediction` (Bzzoiro): sin cálculo propio.
 * Siempre objeto estable; `source:null` cuando no hay captura.
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
    confidence: raw?.confidence ?? null,
    model: raw?.model ?? null,
    capturedAt: raw?.capturedAt ?? null,
    source: raw ? (raw.source ?? 'Bzzoiro') : null,
  };
}

/** Eco directo de `match.h2h` (Bzzoiro); `recent` acotado a 5. */
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

/** Stub de disciplina: el modelo Poisson de tarjetas vive aquí cuando se evalúe. */
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

/** Stub de balón parado: el modelo propio de córners/tiros/xG vive aquí. */
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
 * Clima + sede por partido. `weatherEntry` es el sidecar `weather.json[id]`;
 * `venue` es `locateMatch(match)` resuelto por el pipeline (evita importar venues aquí).
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

/** Disponibilidad desde `match.lineups` (Bzzoiro); ausencias confirmadas, nunca estimadas. */
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
