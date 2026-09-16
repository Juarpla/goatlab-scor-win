/** Common fixture boundary. Provider IDs are namespaced; absent metrics remain null. */
import { sameClub } from './teams.js';

export const competitions = [
  { id: 'champions', name: 'Champions League', api: 2, fd: 'CL' },
  { id: 'europa', name: 'Europa League', api: 3, fd: null },
  { id: 'libertadores', name: 'Libertadores', api: 13, fd: 'CLI' },
  { id: 'laliga', name: 'LaLiga', api: 140, fd: 'PD' },
  { id: 'premier', name: 'Premier League', api: 39, fd: 'PL' },
];
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
 * The fixture window. Two free providers, one boundary:
 * - API-Football is fresher (minute-by-minute score) but its free plan only
 *   serves yesterday..tomorrow; it is authoritative for those dates.
 * - Football-Data.org serves any date range in one request and fills the rest
 *   of the window. When API-Football already covers the whole window, it is
 *   not called at all.
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
          const league = competitions.find(c => c.api === item.league.id);
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
        const league = competitions.find(c => c.fd && c.fd === item.competition.code);
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
export async function getStandings({ competition, season, top = 10, env = {}, fetchImpl = fetch, logger = console, paceMs = 6_500 }) {
  if (!env.FOOTBALL_DATA_KEY || !competition.fd) return null;
  try {
    const data = await pacedRequest(`https://api.football-data.org/v4/competitions/${competition.fd}/standings?season=${season}`, { 'X-Auth-Token': env.FOOTBALL_DATA_KEY }, fetchImpl, paceMs);
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
 * Season results for the local results base. The free API-Football plan only
 * serves seasons 2022–2024, so the backfill runs on football-data.org, which
 * serves the current season of its covered competitions (Europa League excepted).
 * One request per competition; finished matches only.
 */
export async function getLeagueResults({ competition, season, env = {}, fetchImpl = fetch, logger = console, paceMs = 6_500 }) {
  if (!env.FOOTBALL_DATA_KEY || !competition.fd) return [];
  try {
    const data = await pacedRequest(`https://api.football-data.org/v4/competitions/${competition.fd}/matches?season=${season}`, { 'X-Auth-Token': env.FOOTBALL_DATA_KEY }, fetchImpl, paceMs);
    if (!Array.isArray(data.matches)) throw new Error('Formato inválido');
    return data.matches.flatMap(item => {
      const league = competitions.find(c => c.id === competition.id && c.fd && c.fd === item.competition.code);
      if (!league || item.status !== 'FINISHED' || item.score.fullTime.home == null) return [];
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
