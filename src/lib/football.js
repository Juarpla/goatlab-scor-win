/** Common fixture boundary. Provider IDs are namespaced; absent metrics remain null. */
import { sameClub, normalize } from './teams.js';
import { listEvents } from './bzzoiro.js';
import { fairProbs } from './odds.js';
import { leagues, leagueByProviderId, providerLeagueId } from './leagues.js';

/** Vista de conveniencia del catálogo único (`public/data/leagues.json`). */
export const competitions = Object.values(leagues).map(({ id, name, providers }) => ({ id, name, api: providers.api, fd: providers.fd }));
/** Leagues the FD free plan does not serve; Bzzoiro discovers them past tomorrow. */
const BZ_DISCOVERY = new Set(['nations', 'europa', 'libertadores']);
/** Statuses that mean the match is played and its final score is authoritative. */
export const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
/**
 * Wall freshness boundary: 90' of play + 15' break + 10' fixed buffer.
 * No league schedules hydration breaks, so none are counted.
 */
export const ESTIMATED_DURATION_MS = 115 * 60_000;
/** True once the estimated end of the match has passed (regardless of status). */
export function isMatchExpired(match, now = Date.now()) {
  return Date.parse(match.kickoff) + ESTIMATED_DURATION_MS <= now;
}
async function request(url, headers, fetchImpl) {
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length) throw new Error('El proveedor no pudo entregar datos');
  return data;
}
// The free API-Football plan allows 10 requests/minute; bursts get rejected.
let lastCall = 0;
async function pacedRequest(url, headers, fetchImpl, paceMs = 6_500) {
  if (paceMs > 0) {
    const wait = lastCall + paceMs - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastCall = Date.now();
  }
  return request(url, headers, fetchImpl);
}
function dateWindow(date, days) {
  return Array.from({ length: Math.max(1, days) }, (_, index) => {
    const day = new Date(`${date}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}
/** Result row for the local results base (input of the form charts). */
export function toResult(match) {
  return { id: match.id, date: match.kickoff.slice(0, 10), competition: match.competition, home: match.home, away: match.away, homeScore: match.homeScore, awayScore: match.awayScore };
}
const byKickoff = (a, b) => (a.kickoff < b.kickoff ? -1 : a.kickoff > b.kickoff ? 1 : 0);
/**
 * Merge two fixture lists. Matches on `replacedDates` come exclusively from the
 * fresh list (the primary provider is authoritative there); elsewhere, a fresh
 * match replaces its previous twin when it is clearly the same fixture
 * (same date, clubs matched tolerantly), and otherwise is appended.
 */
export function mergeFixtures(previous, fresh, replacedDates = []) {
  const replaced = new Set(replacedDates);
  const merged = previous.filter(match => !replaced.has(match.kickoff.slice(0, 10)));
  for (const match of fresh) {
    const index = merged.findIndex(existing => existing.kickoff.slice(0, 10) === match.kickoff.slice(0, 10) && sameClub(existing.home, match.home) && sameClub(existing.away, match.away));
    if (index >= 0) merged[index] = match;
    else merged.push(match);
  }
  return merged.sort(byKickoff);
}
/**
 * The fixture window. Three free providers, one boundary:
 * - API-Football is fresher (minute-by-minute score) but its free plan only
 *   serves yesterday..tomorrow; it is authoritative for those dates.
 * - Football-Data.org serves any date range in one request and fills the rest
 *   of the window. When API-Football already covers the whole window, it is
 *   not called at all.
 * - Bzzoiro discovers the leagues the FD free plan does not serve (nations,
 *   europa, libertadores) on the days API-Football cannot reach, in a single
 *   range request. Events arrive with canonical team ids, so enrichment pairs
 *   them without name guessing.
 */
export async function getFixtures({ date, days = 1, env = {}, fetchImpl = fetch, logger = console, paceMs = 6_500, now = new Date() }) {
  const dates = dateWindow(date, days);
  const errors = [];
  let matches = [];
  let provider = null;
  let delayed = true;
  const todayUtc = typeof now === 'string' ? now : now.toISOString().slice(0, 10);
  const shift = (day, amount) => {
    const day2 = new Date(`${day}T00:00:00Z`);
    day2.setUTCDate(day2.getUTCDate() + amount);
    return day2.toISOString().slice(0, 10);
  };
  const overlayDates = dates.filter(day => day >= shift(todayUtc, -1) && day <= shift(todayUtc, 1));
  const complement = dates.filter(day => !overlayDates.includes(day));
  let afDone = false;
  if (env.API_FOOTBALL_KEY && overlayDates.length) {
    try {
      const afMatches = [];
      // One request per day: the from/to window requires league+season, which we do not want here.
      for (const day of overlayDates) {
        const data = await pacedRequest(`https://v3.football.api-sports.io/fixtures?date=${encodeURIComponent(day)}`, { 'x-apisports-key': env.API_FOOTBALL_KEY }, fetchImpl, paceMs);
        if (!Array.isArray(data.response)) throw new Error('Formato inválido');
        afMatches.push(...data.response.flatMap(item => {
          const league = leagueByProviderId('api', item.league.id);
          return league ? [{
            id: `af-${item.fixture.id}`, providerId: item.fixture.id, competition: league.id,
            home: item.teams.home.name, away: item.teams.away.name, kickoff: item.fixture.date,
            status: item.fixture.status.short, minute: item.fixture.status.elapsed,
            homeScore: item.goals.home, awayScore: item.goals.away,
            halfTime: item.score?.halftime?.home != null ? { home: item.score.halftime.home, away: item.score.halftime.away } : null,
            round: item.league.round ?? null,
            venue: item.fixture.venue?.name ?? null,
            venueCity: item.fixture.venue?.city ?? null,
            events: null, statistics: null,
          }] : [];
        }));
      }
      matches = afMatches;
      provider = 'API-Football';
      delayed = false;
      afDone = true;
    } catch (error) { errors.push(`API-Football: ${error.message}`); }
  }
  const fdNeeded = complement.length > 0 || !afDone;
  if (env.FOOTBALL_DATA_KEY && fdNeeded) {
    try {
      const from = complement.length ? complement[0] : date;
      const to = complement.length ? complement[complement.length - 1] : dates[dates.length - 1];
      const data = await request(`https://api.football-data.org/v4/matches?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`, { 'X-Auth-Token': env.FOOTBALL_DATA_KEY }, fetchImpl);
      if (!Array.isArray(data.matches)) throw new Error('Formato inválido');
      // Normalize statuses to the API-Football vocabulary the rest of the site speaks.
      const FD_STATUS = { SCHEDULED: 'NS', TIMED: 'NS', IN_PLAY: 'LIVE', PAUSED: 'HT', FINISHED: 'FT', SUSPENDED: 'SUSP', POSTPONED: 'PST', CANCELLED: 'CANC', AWARDED: 'FT' };
      const fdMatches = data.matches.flatMap(item => {
        const league = leagueByProviderId('fd', item.competition.code);
        return league ? [{
          id: `fd-${item.id}`, providerId: item.id, competition: league.id,
          home: item.homeTeam.name, away: item.awayTeam.name, kickoff: item.utcDate,
          status: FD_STATUS[item.status] ?? item.status, minute: null,
          homeScore: item.score.fullTime.home, awayScore: item.score.fullTime.away,
          halfTime: item.score.halfTime?.home != null ? { home: item.score.halfTime.home, away: item.score.halfTime.away } : null,
          round: item.matchday ?? null,
          stage: item.stage ?? null,
          venue: item.venue ?? null,
          venueCity: null,
          events: null, statistics: null,
        }] : [];
      });
      matches = afDone ? mergeFixtures(matches, fdMatches) : fdMatches;
      provider = provider ? 'API-Football + Football-Data.org' : 'Football-Data.org';
    } catch (error) { errors.push(`Football-Data.org: ${error.message}`); }
  }
  if (env.BZZOIRO_API_TOKEN && complement.length) {
    try {
      const events = await listEvents({ dateFrom: complement[0], dateTo: complement[complement.length - 1], env, fetchImpl });
      const BZ_STATUS = { notstarted: 'NS', finished: 'FT' };
      const discovered = events.flatMap(event => {
        const league = leagueByProviderId('bzzoiro', event?.league_id);
        if (!league || !BZ_DISCOVERY.has(league.id) || !event?.home_team || !event?.away_team || !event?.event_date) return [];
        return [{
          id: `bz-${event.id}`, providerId: event.id, competition: league.id,
          home: event.home_team, away: event.away_team, kickoff: event.event_date,
          status: BZ_STATUS[event.status] ?? 'NS', minute: null,
          homeScore: event.home_score ?? null, awayScore: event.away_score ?? null,
          halfTime: event.home_score_ht != null && event.away_score_ht != null ? { home: event.home_score_ht, away: event.away_score_ht } : null,
          round: event.round_label ?? null,
          venue: null, venueCity: null,
          events: null, statistics: null,
          eventId: event.id, teamIds: { home: event.home_team_id ?? null, away: event.away_team_id ?? null },
        }];
      });
      if (discovered.length) {
        matches = mergeFixtures(matches, discovered);
        provider = provider ? `${provider} + Bzzoiro` : 'Bzzoiro';
      }
    } catch (error) { errors.push(`Bzzoiro: ${error.message}`); }
  }
  if (!provider) {
    errors.forEach(error => logger.warn(error));
    return { matches: [], provider: null, delayed: true, updatedAt: null, unavailable: true, errors };
  }
  // An empty valid schedule is authoritative, not an outage.
  return { matches, provider, delayed, updatedAt: new Date().toISOString(), errors };
}
/**
 * League table for the current season (football-data.org; the free plan serves
 * the current season standings of its competitions). Only the TOTAL table;
 * knockout-style stages are skipped rather than half-rendered.
 */
export async function getStandings({ competition, season, top = 20, env = {}, fetchImpl = fetch, logger = console, paceMs = 6_500 }) {
  const fd = providerLeagueId(competition.id, 'fd');
  if (!env.FOOTBALL_DATA_KEY || !fd) return null;
  try {
    const data = await pacedRequest(`https://api.football-data.org/v4/competitions/${fd}/standings?season=${season}`, { 'X-Auth-Token': env.FOOTBALL_DATA_KEY }, fetchImpl, paceMs);
    // La v4 de football-data.org nombra la fase de liga «REGULAR_SEASON»; las
    // respuestas antiguas usaban «TOTAL». Aceptamos ambas, solo la tabla TOTAL.
    const total = data.standings?.find(entry => entry.type === 'TOTAL' && (entry.stage === 'TOTAL' || entry.stage === 'REGULAR_SEASON'));
    if (!Array.isArray(total?.table)) return null;
    const FORM = { W: 'G', D: 'E', L: 'P' };
    return {
      season: String(data.season?.startDate?.slice(0, 4) ?? season),
      provider: 'Football-Data.org',
      updatedAt: new Date().toISOString(),
      rows: total.table.slice(0, top).map(row => ({
        position: row.position, team: row.team.name,
        played: row.playedGames, won: row.won, drawn: row.draw, lost: row.lost,
        goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst, goalDifference: row.goalDifference, points: row.points,
        form: Array.isArray(row.form) ? row.form.map(letter => FORM[letter] ?? null).filter(Boolean) : null,
      })),
    };
  } catch (error) { logger.warn(`Tabla (${competition.id}): ${error.message}`); return null; }
}

/**
 * Goleadores de la temporada (football-data.org). La v4 devuelve el top de la
 * competición con goles, asistencias, penaltis y partidos; ausencias honestas
 * quedan en null. Europa League exceptuada (sin `fd`).
 */
export async function getScorers({ competition, season, env = {}, fetchImpl = fetch, logger = console, paceMs = 6_500 }) {
  const fd = providerLeagueId(competition.id, 'fd');
  if (!env.FOOTBALL_DATA_KEY || !fd) return [];
  try {
    const data = await pacedRequest(`https://api.football-data.org/v4/competitions/${fd}/scorers?season=${season}`, { 'X-Auth-Token': env.FOOTBALL_DATA_KEY }, fetchImpl, paceMs);
    if (!Array.isArray(data.scorers)) return [];
    return data.scorers.map(row => ({
      player: row.player?.name ?? null,
      team: row.team?.name ?? row.team?.shortName ?? null,
      goals: row.goals ?? null,
      assists: row.assists ?? null,
      penalties: row.penalties ?? null,
      playedMatches: row.playedMatches ?? null,
    })).filter(row => row.player);
  } catch (error) { logger.warn(`Goleadores FD (${competition.id}): ${error.message}`); return []; }
}

/**
 * Fusión de goleadores: Football-Data.org manda en goles/asistencias/penaltis/
 * partidos; Bzzoiro conserva playerId/teamId/rank. Los sin pareja honesta
 * quedan con nulos, nunca se inventan ids.
 */
export function fuseScorers(bzzoiroRows, fdRows) {
  if (!bzzoiroRows?.length) return bzzoiroRows ?? null;
  if (!fdRows?.length) return bzzoiroRows;
  const byPlayer = new Map(fdRows.map(row => [normalize(row.player), row]));
  const seen = new Set();
  const fused = bzzoiroRows.map(row => {
    const fd = byPlayer.get(normalize(row.player));
    if (!fd) return row;
    seen.add(normalize(row.player));
    return {
      ...row,
      value: fd.goals ?? row.value,
      goals: fd.goals ?? row.value,
      assists: fd.assists ?? null,
      penalties: fd.penalties ?? null,
      matches: fd.playedMatches ?? row.matches,
    };
  });
  for (const fd of fdRows) {
    if (seen.has(normalize(fd.player))) continue;
    fused.push({
      rank: null, player: fd.player, playerId: null, position: null,
      team: fd.team, teamId: null, value: fd.goals,
      goals: fd.goals, assists: fd.assists, penalties: fd.penalties,
      matches: fd.playedMatches,
    });
  }
  return fused;
}

/**
 * Season results for the local results base. The free API-Football plan only
 * serves seasons 2022–2024, so the backfill runs on football-data.org, which
 * serves the current season of its covered competitions (Europa League excepted).
 * One request per competition; finished matches only.
 */
export async function getLeagueResults({ competition, season, env = {}, fetchImpl = fetch, logger = console, paceMs = 6_500 }) {
  const fd = providerLeagueId(competition.id, 'fd');
  if (!env.FOOTBALL_DATA_KEY || !fd) return [];
  try {
    const data = await pacedRequest(`https://api.football-data.org/v4/competitions/${fd}/matches?season=${season}`, { 'X-Auth-Token': env.FOOTBALL_DATA_KEY }, fetchImpl, paceMs);
    if (!Array.isArray(data.matches)) throw new Error('Formato inválido');
    return data.matches.flatMap(item => {
      const league = leagueByProviderId('fd', item.competition.code);
      if (!league || league.id !== competition.id || item.status !== 'FINISHED' || item.score.fullTime.home == null) return [];
      return [{
        id: `fd-${item.id}`, date: item.utcDate.slice(0, 10), competition: league.id,
        home: item.homeTeam.name, away: item.awayTeam.name,
        homeScore: item.score.fullTime.home, awayScore: item.score.fullTime.away,
        halfTime: item.score.halfTime?.home != null ? { home: item.score.halfTime.home, away: item.score.halfTime.away } : null,
        matchday: item.matchday ?? null,
      }];
    });
  } catch (error) { logger.warn(`Resultados (${competition.id}): ${error.message}`); return []; }
}

/* ---- Predicciones de API-Football (contexto del narrador; nunca cuotas) ---- */

const pctFromString = value => {
  const match = typeof value === 'string' ? value.match(/(\d+(?:\.\d+)?)\s*%/) : null;
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? Math.round(number * 10) / 1000 : null;
};

/**
 * Payload de `/predictions?fixture=` → lectura del proveedor en campos
 * estables. `advice` viaja como texto crudo para que el prompt lo reformule
 * sin lenguaje de apuesta. Null honesto si no hay nada reconocible.
 */
export function mapProviderPrediction(data) {
  const predictions = Array.isArray(data?.response) ? data.response[0]?.predictions : null;
  if (!predictions) return null;
  const percent = predictions.percent ? {
    home: pctFromString(predictions.percent.home),
    draw: pctFromString(predictions.percent.draw),
    away: pctFromString(predictions.percent.away),
  } : null;
  if (!predictions.winner?.name && !predictions.advice && !percent?.home && !percent?.draw && !percent?.away) return null;
  return {
    winner: predictions.winner?.name ?? null,
    winnerComment: predictions.winner?.comment ?? null,
    winOrDraw: typeof predictions.win_or_draw === 'boolean' ? predictions.win_or_draw : null,
    underOver: predictions.under_over ?? null,
    goals: { home: predictions.goals?.home ?? null, away: predictions.goals?.away ?? null },
    advice: typeof predictions.advice === 'string' ? predictions.advice.slice(0, 160) : null,
    percent,
    capturedAt: new Date().toISOString(),
    source: 'API-Football',
  };
}

/** 1 request por partido; sin id o sin clave responde null sin llamar. */
export async function fetchProviderPrediction(fixtureId, { env = {}, fetchImpl = fetch, paceMs = 6_500 } = {}) {
  if (fixtureId == null || !env.API_FOOTBALL_KEY) return null;
  try {
    const data = await pacedRequest(`https://v3.football.api-sports.io/predictions?fixture=${encodeURIComponent(fixtureId)}`, { 'x-apisports-key': env.API_FOOTBALL_KEY }, fetchImpl, paceMs);
    return mapProviderPrediction(data);
  } catch { return null; }
}

/* ---- Odds pre-partido de API-Football (solo % interpretativos, nunca cuotas) ---- */

const numOdd = value => {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 1 ? number : null;
};
const meanOdds = rows => {
  const valid = (rows ?? []).filter(row => Array.isArray(row) && row.every(numOdd));
  if (!valid.length) return null;
  return valid[0].map((_, index) => valid.reduce((sum, row) => sum + row[index], 0) / valid.length);
};

/**
 * Payload de `/odds?fixture=` → % justos (sin margen) de 1X2, over 2.5 y BTTS.
 * Apuestas: id 1 (ganador), 5 (más/menos goles, línea 2.5), 8 (marcan los dos).
 * Promedia cuotas entre casas y quita el margen; lo irreconocible es null.
 */
export function mapAfOdds(data) {
  const bookmakers = Array.isArray(data?.response?.[0]?.bookmakers) ? data.response[0].bookmakers : null;
  if (!bookmakers?.length) return null;
  const betsOf = bookmaker => Array.isArray(bookmaker?.bets) ? bookmaker.bets : [];
  const findBet = (bets, ids, nameMatch) => bets.find(bet => ids.includes(bet?.id) || (typeof bet?.name === 'string' && nameMatch.test(bet.name))) ?? null;
  const oddOf = (bet, labelMatch) => numOdd(bet?.values?.find(item => typeof item?.value === 'string' && labelMatch.test(item.value))?.odd);
  const winnerRows = [];
  const overRows = [];
  const bttsRows = [];
  for (const bookmaker of bookmakers) {
    const bets = betsOf(bookmaker);
    const winner = findBet(bets, [1], /match winner/i);
    if (winner) {
      const row = [oddOf(winner, /^home$/i), oddOf(winner, /^draw$/i), oddOf(winner, /^away$/i)];
      if (row.every(numOdd)) winnerRows.push(row);
    }
    const totals = findBet(bets, [5], /over\/under|goals over\/under/i);
    if (totals) {
      const row = [oddOf(totals, /^over 2\.5$/i), oddOf(totals, /^under 2\.5$/i)];
      if (row.every(numOdd)) overRows.push(row);
    }
    const btts = findBet(bets, [8], /both teams/i);
    if (btts) {
      const row = [oddOf(btts, /^yes$/i), oddOf(btts, /^no$/i)];
      if (row.every(numOdd)) bttsRows.push(row);
    }
  }
  const fair = rows => fairProbs(meanOdds(rows)) ?? null;
  const oneX2Fair = winnerRows.length ? fair(winnerRows) : null;
  const overFair = overRows.length ? fair(overRows) : null;
  const bttsFair = bttsRows.length ? fair(bttsRows) : null;
  const oneX2 = oneX2Fair ? { home: oneX2Fair[0], draw: oneX2Fair[1], away: oneX2Fair[2] } : null;
  const over25 = overFair ? overFair[0] : null;
  const btts = bttsFair ? bttsFair[0] : null;
  if (!oneX2 && over25 == null && btts == null) return null;
  return { oneX2, over25, btts, bookmakers: bookmakers.length, capturedAt: new Date().toISOString(), source: 'API-Football' };
}

/** 1 request por partido; sin id o sin clave responde null sin llamar. */
export async function fetchAfOdds(fixtureId, { env = {}, fetchImpl = fetch, paceMs = 6_500 } = {}) {
  if (fixtureId == null || !env.API_FOOTBALL_KEY) return null;
  try {
    const data = await pacedRequest(`https://v3.football.api-sports.io/odds?fixture=${encodeURIComponent(fixtureId)}`, { 'x-apisports-key': env.API_FOOTBALL_KEY }, fetchImpl, paceMs);
    return mapAfOdds(data);
  } catch { return null; }
}

/* ---- Estadísticas por equipo de API-Football (relleno de la tabla de esperados) ---- */

const AF_STAT_TYPES = {
  'Ball Possession': 'possession',
  'Total Shots': 'shots',
  'Shots on Goal': 'shotsOnTarget',
  'Corner Kicks': 'corners',
  'Fouls': 'fouls',
  'Yellow Cards': 'yellowCards',
  'Red Cards': 'redCards',
  'Offsides': 'offsides',
};
const afStatNumber = (type, value) => {
  if (value == null || value === '-') return null;
  if (type === 'Ball Possession') {
    const match = String(value).match(/(\d+(?:\.\d+)?)\s*%/);
    return match ? Number(match[1]) : null;
  }
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

/**
 * Payload de `/fixtures/statistics?fixture=` → bolsas por equipo con las
 * claves de STAT_METRICS (sin xG: AF no publica goles esperados). Null
 * honesto si ningún lado trae nada reconocible.
 */
export function mapAfFixtureStatistics(data) {
  const rows = Array.isArray(data?.response) ? data.response : null;
  if (!rows?.length) return null;
  const bag = entry => {
    const out = {};
    for (const stat of entry?.statistics ?? []) {
      const key = AF_STAT_TYPES[stat?.type];
      if (!key || out[key] != null) continue;
      out[key] = afStatNumber(stat.type, stat.value);
    }
    return out;
  };
  const sides = rows.slice(0, 2).map(entry => ({ team: entry?.team?.name ?? null, stats: bag(entry) }));
  if (!sides.some(side => Object.values(side.stats).some(value => value != null))) return null;
  return { home: sides[0], away: sides[1], source: 'API-Football' };
}

/** 1 request por fixture; sin id o sin clave responde null sin llamar. */
export async function fetchAfFixtureStats(fixtureId, { env = {}, fetchImpl = fetch, paceMs = 6_500 } = {}) {
  if (fixtureId == null || !env.API_FOOTBALL_KEY) return null;
  try {
    const data = await pacedRequest(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${encodeURIComponent(fixtureId)}`, { 'x-apisports-key': env.API_FOOTBALL_KEY }, fetchImpl, paceMs);
    return mapAfFixtureStatistics(data);
  } catch { return null; }
}

/**
 * `fixtures?date=` normalizado para emparejar recientes Bzzoiro con su
 * fixture AF (1 request por fecha; el pipeline lo cachea por día).
 */
export async function fetchAfFixturesByDate(date, { env = {}, fetchImpl = fetch, paceMs = 6_500 } = {}) {
  if (!date || !env.API_FOOTBALL_KEY) return [];
  try {
    const data = await pacedRequest(`https://v3.football.api-sports.io/fixtures?date=${encodeURIComponent(date)}`, { 'x-apisports-key': env.API_FOOTBALL_KEY }, fetchImpl, paceMs);
    if (!Array.isArray(data?.response)) return [];
    return data.response
      .map(item => ({
        fixtureId: item?.fixture?.id ?? null,
        home: item?.teams?.home?.name ?? null, away: item?.teams?.away?.name ?? null,
        homeId: item?.teams?.home?.id ?? null, awayId: item?.teams?.away?.id ?? null,
        date,
      }))
      .filter(row => row.fixtureId != null && row.home && row.away);
  } catch { return []; }
}

/** Gemelo AF de un reciente Bzzoiro por nombres tolerantes; null sin pareja honesta. */
export function findAfFixture(list, home, away) {
  return (list ?? []).find(row => sameClub(row.home, home) && sameClub(row.away, away)) ?? null;
}

/* ---- Goleadores de API-Football (fallback Nivel 3, tras flag AF_TOPSCORERS) ---- */

/**
 * Payload de `/players/topscorers?league=&season=` → filas `{player, team,
 * value, matches}` compatibles con `scorerShares`. Null honesto si no hay
 * nada reconocible. Contrato a verificar con clave en mano (plan free).
 */
export function mapAfTopScorers(data, { limit = 50 } = {}) {
  const rows = Array.isArray(data?.response) ? data.response : null;
  if (!rows?.length) return null;
  const mapped = rows.map(entry => {
    const stats = Array.isArray(entry?.statistics) ? entry.statistics[0] : null;
    return {
      player: entry?.player?.name ?? null,
      team: stats?.team?.name ?? null,
      value: stats?.goals?.total ?? null,
      matches: stats?.games?.appearences ?? stats?.games?.played ?? null,
    };
  }).filter(row => row.player && row.team && Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, Math.max(1, limit));
  return mapped.length ? mapped : null;
}

/** 1 request por liga/temporada; sin clave responde null sin llamar. */
export async function fetchAfTopScorers(leagueId, season, { env = {}, fetchImpl = fetch, paceMs = 6_500 } = {}) {
  if (leagueId == null || season == null || !env.API_FOOTBALL_KEY) return null;
  try {
    const data = await pacedRequest(`https://v3.football.api-sports.io/players/topscorers?league=${encodeURIComponent(leagueId)}&season=${encodeURIComponent(season)}`, { 'x-apisports-key': env.API_FOOTBALL_KEY }, fetchImpl, paceMs);
    return mapAfTopScorers(data);
  } catch { return null; }
}

/* ---- Bajas y plantillas de API-Football (fallback de TrendsStrip) ---- */

/**
 * Payload de `/injuries?fixture=` → filas `{player, team, type, reason}`.
 * `type`: Injury|Suspension (tal cual del proveedor); `reason`: detalle
 * ("Knee Injury", "Suspended 3 matches"). Null honesto si no hay nada
 * reconocible (incluido plan free sin cobertura para la temporada).
 */
export function mapAfInjuries(data, { limit = 12 } = {}) {
  const rows = Array.isArray(data?.response) ? data.response : null;
  if (!rows?.length) return null;
  const mapped = rows.map(entry => ({
    player: entry?.player?.name ?? null,
    team: entry?.team?.name ?? null,
    type: entry?.player?.type ?? entry?.type ?? null,
    reason: entry?.player?.reason ?? entry?.reason ?? null,
  })).filter(row => row.player && row.team)
    .slice(0, Math.max(1, limit));
  return mapped.length ? mapped : null;
}

/** 1 request por fixture; sin id o sin clave responde null sin llamar. */
export async function fetchAfInjuries(fixtureId, { env = {}, fetchImpl = fetch, paceMs = 6_500 } = {}) {
  if (fixtureId == null || !env.API_FOOTBALL_KEY) return null;
  try {
    const data = await pacedRequest(`https://v3.football.api-sports.io/injuries?fixture=${encodeURIComponent(fixtureId)}`, { 'x-apisports-key': env.API_FOOTBALL_KEY }, fetchImpl, paceMs);
    return mapAfInjuries(data);
  } catch { return null; }
}

/**
 * Payload de `/players/squads?team=` → filas `{id, name, age, number,
 * position, photo}`. Sin estadísticas de temporada (el endpoint no las
 * trae); la vista muestra una muestra honesta, nunca un ranking inventado.
 * Null honesto si no hay nada reconocible.
 */
export function mapAfSquad(data, { limit = 30 } = {}) {
  const rows = Array.isArray(data?.response?.[0]?.players) ? data.response[0].players
    : Array.isArray(data?.response) ? data.response : null;
  if (!rows?.length) return null;
  const mapped = rows.map(entry => ({
    id: entry?.id ?? null,
    name: entry?.name ?? null,
    age: Number.isFinite(entry?.age) ? entry.age : null,
    number: Number.isFinite(entry?.number) ? entry.number : null,
    position: entry?.position ?? null,
    photo: entry?.photo ?? null,
  })).filter(row => row.name)
    .slice(0, Math.max(1, limit));
  return mapped.length ? mapped : null;
}

/** 1 request por equipo; sin id o sin clave responde null sin llamar. */
export async function fetchAfSquad(teamId, { env = {}, fetchImpl = fetch, paceMs = 6_500 } = {}) {
  if (teamId == null || !env.API_FOOTBALL_KEY) return null;
  try {
    const data = await pacedRequest(`https://v3.football.api-sports.io/players/squads?team=${encodeURIComponent(teamId)}`, { 'x-apisports-key': env.API_FOOTBALL_KEY }, fetchImpl, paceMs);
    return mapAfSquad(data);
  } catch { return null; }
}
