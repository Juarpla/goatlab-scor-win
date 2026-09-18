/**
 * Bzzoiro Sports Data (REST gratuito): estadísticas con xG, incidentes, historial
 * cara a cara, alineaciones, jugadores destacados y predicciones del modelo.
 * Los partidos se emparejan por nombre de equipo contra la agenda del día; si no hay
 * coincidencia confiable, el partido queda sin enriquecer (null) en lugar de inventar datos.
 * Los escudos se resuelven con su Image API (solo identificación, hotlink directo).
 */
import { normalize } from './teams.js';
const BASE = 'https://sports.bzzoiro.com/api/v2';
const DROP_TOKENS = new Set(['fc', 'cf', 'sc', 'afc', 'club', 'the']);
const TOKEN_ALIASES = { utd: 'united', psg: 'paris', 'saint-germain': 'saint germain' };

export function teamTokens(name) {
  const normalized = String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = normalized.split(' ').filter(token => token && !DROP_TOKENS.has(token)).map(token => TOKEN_ALIASES[token] ?? token);
  return new Set(tokens);
}
export function sameTeam(a, b) {
  const left = teamTokens(a);
  const right = teamTokens(b);
  if (!left.size || !right.size) return false;
  const covers = (small, large) => [...small].every(token => large.has(token));
  if (covers(left, right) || covers(right, left)) {
    // A single generic short token ("city") must not match on its own.
    const smaller = left.size <= right.size ? left : right;
    if (smaller.size > 1 || [...smaller][0].length >= 4) return true;
  }
  // Abbreviations in either direction: every token of one side is a prefix of a token of the other ("man city" ≈ "manchester city").
  const abbreviates = (short, long) => [...short].every(token => token.length >= 3 && [...long].some(other => other.startsWith(token)));
  return abbreviates(left, right) || abbreviates(right, left);
}
const STAT_KEYS = {
  possession: ['ball_possession', 'possession'],
  shots: ['total_shots', 'shots'],
  shotsOnTarget: ['shots_on_target', 'shots_on_goal'],
  corners: ['corner_kicks', 'corners'],
  fouls: ['fouls', 'fouls_committed'],
  yellowCards: ['yellow_cards'],
  redCards: ['red_cards'],
  offsides: ['offsides'],
  saves: ['saves', 'goalkeeper_saves'],
  passes: ['passes', 'total_passes'],
  accuratePasses: ['accurate_passes', 'passes_completed'],
  tackles: ['tackles'],
  interceptions: ['interceptions'],
  clearances: ['clearances'],
  blocks: ['blocks', 'shots_blocked'],
  crosses: ['crosses'],
  dribbles: ['dribbles', 'successful_dribbles'],
  duelsWon: ['duels_won'],
  aerialsWon: ['aerials_won'],
};
function pickStat(side, names) {
  for (const name of names) if (side?.[name] != null) return side[name];
  return null;
}
function mapStats(data) {
  const stats = data?.stats;
  if (!stats?.home || !stats?.away) return null;
  const pick = side => {
    const base = {};
    for (const [key, names] of Object.entries(STAT_KEYS)) base[key] = pickStat(side, names);
    const xg = side.xg;
    base.xg = typeof xg === 'object' ? (xg.actual ?? xg.expected ?? null) : (xg ?? null);
    base.xgOnTarget = typeof xg === 'object' ? (xg.on_target ?? null) : null;
    return base;
  };
  const home = pick(stats.home);
  const away = pick(stats.away);
  // Pre-match the feed answers with all-null bags; that is "no statistics yet", not a table of dashes.
  const hasData = [...Object.values(home), ...Object.values(away)].some(value => value != null);
  if (!hasData) return null;
  const payload = { home, away, xgEstimated: data.xg_estimated ?? null, source: 'Bzzoiro' };
  for (const [key, names] of [['shotmap', ['shotmap', 'shots_map']], ['momentum', ['momentum']], ['avgPositions', ['avg_positions', 'average_positions']]]) {
    const value = pickStat(data, names);
    if (value != null) payload[key] = value;
  }
  return payload;
}
const INCIDENT_TYPES = { goal: 'goal', card: 'card', substitution: 'sub', var: 'var' };
function mapIncidents(data) {
  const incidents = data?.incidents;
  if (!Array.isArray(incidents)) return null;
  const events = incidents.filter(item => INCIDENT_TYPES[item.type]).map(item => ({
    minute: item.minute ?? null,
    periodSecond: item.period_second ?? null,
    type: INCIDENT_TYPES[item.type],
    team: item.is_home === true ? 'home' : item.is_home === false ? 'away' : null,
    player: item.player ?? item.player_in ?? null,
    playerOut: item.player_out ?? null,
    assist: item.assist ?? null,
    goalType: item.goal_type ?? null,
    cardType: item.card_type ?? null,
    rescinded: item.rescinded ?? item.rescinded_card ?? null,
    varReview: item.var ?? item.var_review ?? null,
    reason: item.reason ?? null,
    detail: item.type === 'card' ? (item.card_type === 'red' ? 'Tarjeta roja' : item.card_type === 'yellow' ? 'Tarjeta amarilla' : item.reason ?? null)
      : item.type === 'goal' && item.goal_type && item.goal_type !== 'regular' ? item.goal_type
      : item.assist ? `Asistencia: ${item.assist}` : null,
    score: item.home_score != null && item.away_score != null ? { home: item.home_score, away: item.away_score } : null,
  }));
  // The feed arrives newest first; the timeline reads oldest first.
  return events.reverse();
}
async function request(url, token, fetchImpl) {
  const res = await fetchImpl(url, { headers: { Authorization: `Token ${token}` }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
/**
 * Devuelve `{ [matchId]: { statistics, events } }` para los partidos de la fecha indicada.
 * Presupuesto acotado: máximo `maxRequests` llamadas de detalle por corrida.
 */
export async function enrichMatches(matches, { date, env = {}, fetchImpl = fetch, logger = console, maxRequests = 24 } = {}) {
  if (!env.BZZOIRO_API_TOKEN || !matches?.length) return {};
  const enrichments = {};
  try {
    const list = await request(`${BASE}/events/?date_from=${encodeURIComponent(date)}&date_to=${encodeURIComponent(date)}&limit=200`, env.BZZOIRO_API_TOKEN, fetchImpl);
    const events = Array.isArray(list?.results) ? list.results : [];
    let budget = maxRequests;
    for (const match of matches) {
      if (budget < 2) break;
      const bzzoiro = events.find(item => sameTeam(item.home_team, match.home) && sameTeam(item.away_team, match.away));
      if (!bzzoiro) continue;
      try {
        const [stats, incidents] = await Promise.all([
          request(`${BASE}/events/${bzzoiro.id}/stats/`, env.BZZOIRO_API_TOKEN, fetchImpl),
          request(`${BASE}/events/${bzzoiro.id}/incidents/`, env.BZZOIRO_API_TOKEN, fetchImpl),
        ]);
        budget -= 2;
        const statistics = mapStats(stats);
        const timeline = mapIncidents(incidents);
        if (statistics || timeline) enrichments[match.id] = { statistics, events: timeline };
      } catch (error) { logger.warn(`Bzzoiro (${match.id}): ${error.message}`); }
    }
  } catch (error) { logger.warn(`Bzzoiro: ${error.message}`); }
  return enrichments;
}

/* ---- Suite de enriquecimiento ampliado (ventana + backfill) ---- */

/** Runs `worker` over `items` with at most `limit` calls in flight; order preserved, failures map to null. */
export async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await worker(items[index], index); } catch { results[index] = null; }
    }
  }));
  return results;
}

/** Pages the event list (max 200/page) inside an inclusive date window, optionally for one team. */
export async function listEvents({ dateFrom, dateTo, status, teamId = null, env = {}, fetchImpl = fetch, logger = console, maxRows = 600 }) {
  if (!env.BZZOIRO_API_TOKEN) return [];
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += 200) {
    try {
      const page = await request(`${BASE}/events/?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}${status ? `&status=${status}` : ''}${teamId != null ? `&team_id=${encodeURIComponent(teamId)}` : ''}&limit=200&offset=${offset}`, env.BZZOIRO_API_TOKEN, fetchImpl);
      const results = Array.isArray(page?.results) ? page.results : [];
      rows.push(...results);
      if (results.length < 200) break;
    } catch (error) { logger?.warn(`Bzzoiro lista (${dateFrom}): ${error.message}`); break; }
  }
  return rows;
}

/** Full-time and per-half bags share the same metric vocabulary. */
export function mapHalfStats(data) {
  const halves = {};
  for (const [key, label] of [['first_half', 'first'], ['second_half', 'second']]) {
    const block = data?.stats?.[key];
    if (!block?.home && !block?.away) continue;
    const pick = side => {
      const base = {};
      for (const [field, names] of Object.entries(STAT_KEYS)) base[field] = pickStat(side, names);
      const xg = side?.xg;
      base.xg = typeof xg === 'object' ? (xg.actual ?? xg.expected ?? null) : (xg ?? null);
      return base;
    };
    halves[label] = { home: pick(block.home), away: pick(block.away) };
  }
  return Object.keys(halves).length ? halves : null;
}

/** Aggregate + per-half stats for one Bzzoiro event id. */
export async function fetchEventStats(eventId, env = {}, fetchImpl = fetch, logger = console) {
  const data = await request(`${BASE}/events/${eventId}/stats/`, env.BZZOIRO_API_TOKEN, fetchImpl);
  const statistics = mapStats(data);
  const halves = mapHalfStats(data);
  return statistics || halves ? { statistics, halves } : null;
}

/**
 * Contexto del partido que el resto de endpoints no trae: clima, césped,
 * asistencia, árbitro, sede, derbi/neutral y viaje. Todo nulleable; lo ausente
 * es ausencia honesta, nunca se inventa.
 */
export function mapEventDetail(data) {
  if (!data || typeof data !== 'object') return null;
  const weather = data.weather ?? null;
  const weatherMapped = weather == null ? null
    : typeof weather === 'string' ? { temp: null, condition: weather, wind: null, humidity: null }
    : typeof weather === 'object' ? {
      temp: weather.temp ?? weather.temperature ?? null,
      condition: weather.condition ?? weather.description ?? null,
      wind: weather.wind ?? weather.wind_speed ?? null,
      humidity: weather.humidity ?? null,
    } : { raw: weather };
  const detail = {
    referee: data.referee ?? data.referee_name ?? null,
    venue: data.venue ?? data.stadium ?? null,
    venueCity: data.venue_city ?? data.city ?? null,
    attendance: data.attendance ?? null,
    pitch: data.pitch ?? data.pitch_condition ?? null,
    weather: weatherMapped,
    derby: data.is_derby ?? data.derby ?? null,
    neutral: data.is_neutral ?? data.neutral_venue ?? null,
    travelKm: data.travel_distance_km ?? data.travel_km ?? data.travel ?? null,
    hasXg: data.has_xg ?? null,
    round: data.round_name ?? data.round ?? null,
    group: data.group_name ?? data.group ?? null,
    kickoff: data.kickoff_time ?? data.kickoff ?? data.date ?? null,
  };
  const hasData = Object.values(detail).some(value => {
    if (value == null || value === false) return false;
    if (typeof value === 'object') return Object.values(value).some(nested => nested != null);
    return true;
  });
  return hasData ? detail : null;
}

export async function fetchEventDetail(eventId, env = {}, fetchImpl = fetch) {
  return mapEventDetail(await request(`${BASE}/events/${eventId}/`, env.BZZOIRO_API_TOKEN, fetchImpl));
}

export function mapH2H(data, recentLimit = 5) {
  if (!data || typeof data.total_matches !== 'number') return null;
  // Cero confirmado no es ausencia: se distingue para no disfrazar un fallo.
  if (data.total_matches === 0) {
    return { totalMatches: 0, homeWins: null, draws: null, awayWins: null, homeGoals: null, awayGoals: null, avgTotalGoals: null, recent: [], source: 'Bzzoiro' };
  }
  return {
    totalMatches: data.total_matches,
    homeWins: data.home_wins ?? null, draws: data.draws ?? null, awayWins: data.away_wins ?? null,
    homeGoals: data.home_goals ?? null, awayGoals: data.away_goals ?? null,
    avgTotalGoals: data.avg_total_goals ?? null,
    recent: (Array.isArray(data.recent_matches) ? data.recent_matches : []).slice(0, recentLimit).map(row => ({
      eventId: row.event_id ?? null, date: row.date ?? null, home: row.home ?? null, away: row.away ?? null,
      homeTeamId: row.home_team_id ?? null, awayTeamId: row.away_team_id ?? null,
      homeScore: row.home_score ?? null, awayScore: row.away_score ?? null,
    })),
    source: 'Bzzoiro',
  };
}

export async function fetchEventH2H(eventId, env = {}, fetchImpl = fetch) {
  return mapH2H(await request(`${BASE}/events/${eventId}/h2h/`, env.BZZOIRO_API_TOKEN, fetchImpl));
}

/**
 * Retransmisiones y social con presupuesto mínimo: una llamada por
 * concepto y partido. Los mapeadores son defensivos (claves alternativas)
 * porque el payload varía por mercado; lo irreconocible se descarta.
 */
export const LATAM_COUNTRIES = ['AR', 'MX', 'CO', 'PE', 'CL', 'UY', 'EC', 'BO', 'PY', 'VE', 'BR', 'CR', 'PA', 'DO', 'GT', 'HN', 'SV', 'NI'];
export function mapBroadcasts(data, countries = LATAM_COUNTRIES, limit = 4) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : Array.isArray(data?.broadcasts) ? data.broadcasts : [];
  return rows.map(row => ({
    channel: row?.channel_name ?? row?.channel?.name ?? row?.name ?? null,
    country: row?.country_code ?? row?.country?.code ?? row?.country ?? null,
  })).filter(item => item.channel && (!item.country || countries.includes(item.country))).slice(0, Math.max(0, limit));
}
export async function fetchEventBroadcasts(eventId, env = {}, fetchImpl = fetch) {
  if (eventId == null || !env.BZZOIRO_API_TOKEN) return null;
  const data = await request(`${BASE}/events/${eventId}/broadcasts/?limit=50`, env.BZZOIRO_API_TOKEN, fetchImpl);
  const rows = mapBroadcasts(data);
  return rows.length ? rows : null;
}
export function mapSocial(data, limit = 3) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : Array.isArray(data?.social) ? data.social : [];
  return rows.map(row => ({
    account: row?.account ?? row?.author ?? row?.username ?? row?.handle ?? null,
    text: row?.text ?? row?.title ?? row?.content ?? null,
    url: row?.url ?? row?.link ?? null,
    published: row?.published_at ?? row?.created_at ?? row?.date ?? null,
  })).filter(item => item.text && item.url).slice(0, Math.max(0, limit));
}
export async function fetchEventSocial(eventId, env = {}, fetchImpl = fetch) {
  if (eventId == null || !env.BZZOIRO_API_TOKEN) return null;
  const data = await request(`${BASE}/events/${eventId}/social/?limit=10`, env.BZZOIRO_API_TOKEN, fetchImpl);
  const rows = mapSocial(data);
  return rows.length ? rows : null;
}

/**
 * Árbitro del encuentro con sus promedios por partido. Resuelve el
 * `referee_id` del evento y pide su ficha; sin id o sin promedios,
 * null honesto (el bloque no se dibuja).
 */
export function mapReferee(data) {
  if (!data || typeof data !== 'object') return null;
  const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const referee = {
    name: data.name ?? data.referee_name ?? data.full_name ?? null,
    avgYellow: num(data.avg_yellow_cards ?? data.avg_yellow ?? data.yellow_cards_avg),
    avgRed: num(data.avg_red_cards ?? data.avg_red ?? data.red_cards_avg),
    avgFouls: num(data.avg_fouls ?? data.fouls_avg),
    matches: Number.isInteger(data.matches) ? data.matches : Number.isInteger(data.games) ? data.games : null,
  };
  if (!referee.name || (referee.avgYellow == null && referee.avgRed == null && referee.avgFouls == null)) return null;
  return referee;
}
export async function fetchEventReferee(eventId, env = {}, fetchImpl = fetch) {
  if (eventId == null || !env.BZZOIRO_API_TOKEN) return null;
  const event = await request(`${BASE}/events/${eventId}/`, env.BZZOIRO_API_TOKEN, fetchImpl);
  const refereeId = event?.referee_id ?? event?.referee?.id ?? null;
  if (refereeId == null) return null;
  const data = await request(`${BASE}/referees/${refereeId}/`, env.BZZOIRO_API_TOKEN, fetchImpl);
  return mapReferee(data);
}

/**
 * True cuando el historial cara a cara puede mostrarse: al menos `min`
 * cruces registrados (el mismo umbral que usa el veredicto para el tilt).
 */
export function hasH2HHistory(h2h, min = 3) {
  return Boolean(h2h && Number.isInteger(h2h.totalMatches) && h2h.totalMatches >= min);
}

/**
 * Últimos partidos terminados de un equipo antes de una fecha: el fallback de
 * "lo que ya jugaron" cuando la base local no cubre al club. La lista del
 * proveedor llega de más reciente a más antigua; se reordena por fecha en
 * cliente y se filtra estrictamente antes de `before`, así el propio
 * encuentro nunca entra. Misma forma de fila que `h2h.recent`.
 */
export function mapTeamLast(rows, { before = null, limit = 5 } = {}) {
  const finished = (Array.isArray(rows) ? rows : [])
    .filter(row => row && row.status === 'finished' && row.home_score != null && row.away_score != null
      && (before == null || (row.event_date ?? '') < before))
    .sort((a, b) => ((a.event_date ?? '') < (b.event_date ?? '') ? 1 : (a.event_date ?? '') > (b.event_date ?? '') ? -1 : 0))
    .slice(0, Math.max(0, limit));
  return finished.map(row => ({
    eventId: row.id ?? null,
    date: row.event_date ?? null,
    home: row.home_team ?? null,
    away: row.away_team ?? null,
    homeTeamId: row.home_team_id ?? null,
    awayTeamId: row.away_team_id ?? null,
    homeScore: row.home_score ?? null,
    awayScore: row.away_score ?? null,
  }));
}

export async function fetchTeamLast(teamId, { before = null, limit = 5, env = {}, fetchImpl = fetch } = {}) {
  if (!env.BZZOIRO_API_TOKEN || teamId == null) return null;
  const data = await request(
    `${BASE}/events/?team_id=${encodeURIComponent(teamId)}&status=finished&limit=${Math.max(limit * 2, 10)}`,
    env.BZZOIRO_API_TOKEN, fetchImpl);
  const rows = mapTeamLast(Array.isArray(data?.results) ? data.results : [], { before, limit });
  return rows.length ? rows : null;
}

function playerEntry(player) {
  const name = player?.name ?? player?.player_name ?? null;
  return name ? { name, player: player?.player_id ?? player?.id ?? null, position: player?.position ?? null, captain: Boolean(player?.captain) } : null;
}
function lineupSide(block, benchCap = 12) {
  if (!block) return null;
  const starters = (Array.isArray(block.starters) ? block.starters : Array.isArray(block.starting_eleven) ? block.starting_eleven : [])
    .slice(0, 11).map(playerEntry).filter(Boolean);
  const subs = (Array.isArray(block.substitutes) ? block.substitutes : Array.isArray(block.bench) ? block.bench : [])
    .slice(0, benchCap).map(playerEntry).filter(Boolean);
  return starters.length ? { starters, subs, confidence: block.confidence ?? null } : null;
}
function mapUnavailable(rows) {
  if (!Array.isArray(rows)) return null;
  const mapped = rows.slice(0, 12).map(row => ({
    name: row.player ?? row.name ?? row.player_name ?? null,
    reason: row.reason ?? row.type ?? null,
    team: row.is_home === true ? 'home' : row.is_home === false ? 'away' : null,
  })).filter(row => row.name);
  return mapped.length ? mapped : null;
}
/** `lineup_status` is the contract: unavailable/missing/null are honest absences, never errors. */
export function mapLineup(data) {
  const status = data?.lineup_status ?? null;
  if (status === 'unavailable' || !data) return status ? { status, home: null, away: null, unavailablePlayers: mapUnavailable(data?.unavailable_players), source: 'Bzzoiro' } : null;
  const home = lineupSide(data.lineups?.home);
  const away = lineupSide(data.lineups?.away);
  if (!home && !away) return null;
  return { status, home, away, unavailablePlayers: mapUnavailable(data.unavailable_players), updatedAt: data.updated_at ?? null, source: 'Bzzoiro' };
}
export async function fetchEventLineup(eventId, env = {}, fetchImpl = fetch) {
  return mapLineup(await request(`${BASE}/events/${eventId}/lineups/`, env.BZZOIRO_API_TOKEN, fetchImpl));
}

/** Per-player match statistics; rows without a reliable side are omitted, never guessed. */
export function mapPlayerStats(data, { homeTeamId, awayTeamId, top = 3 } = {}) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.player_stats) ? data.player_stats : Array.isArray(data?.stats) ? data.stats : null;
  if (!rows?.length) return null;
  const keyed = rows.filter(row => (row?.team_id ?? row?.teamId) != null && (row?.player_name ?? row?.player ?? row?.name));
  function split() {
    if (homeTeamId != null && awayTeamId != null) {
      const home = keyed.filter(row => row.team_id === homeTeamId), away = keyed.filter(row => row.team_id === awayTeamId);
      return home.length || away.length ? { home, away } : null;
    }
    if (keyed.length && keyed.every(row => row.is_home === true || row.is_home === false)) {
      return { home: keyed.filter(row => row.is_home === true), away: keyed.filter(row => row.is_home === false) };
    }
    return null;
  }
  const sides = split();
  if (!sides) return null;
  const entry = row => ({
    name: row.player_name ?? row.player ?? row.name,
    player: row.player_id ?? row.id ?? null,
    rating: row.rating ?? row.score ?? null,
    goals: row.goals ?? null, assists: row.assists ?? null,
    minutes: row.minutes ?? row.minutes_played ?? null,
    shots: row.shots ?? row.total_shots ?? null,
    shotsOnTarget: row.shots_on_target ?? null,
    keyPasses: row.key_passes ?? null,
    xg: row.xg?.actual ?? row.xg ?? row.expected_goals ?? null,
    bigChances: row.big_chances ?? null,
    tackles: row.tackles ?? null,
    saves: row.saves ?? null,
  });
  const pickTop = sideRows => sideRows.map(entry)
    .sort((a, b) => (Number.isFinite(b.rating) ? b.rating : -1) - (Number.isFinite(a.rating) ? a.rating : -1))
    .slice(0, top);
  const home = pickTop(sides.home), away = pickTop(sides.away);
  return home.length || away.length ? { home, away, source: 'Bzzoiro' } : null;
}
export async function fetchEventPlayerStats(eventId, options, env = {}, fetchImpl = fetch) {
  const data = await request(`${BASE}/events/${eventId}/player-stats/`, env.BZZOIRO_API_TOKEN, fetchImpl);
  return mapPlayerStats(data, options);
}

/** CatBoost probabilities arrive 0–100; the site speaks 0–1. Raw capture, no blend here. */
export function mapPrediction(data) {
  const markets = data?.markets;
  if (!markets) return null;
  const pct = value => (typeof value === 'number' && Number.isFinite(value) ? value / 100 : null);
  const result = markets.match_result;
  return {
    oneX2: result && result.prob_home != null ? { home: pct(result.prob_home), draw: pct(result.prob_draw), away: pct(result.prob_away), predicted: result.predicted ?? null } : null,
    xg: markets.expected_goals ? { home: markets.expected_goals.home ?? null, away: markets.expected_goals.away ?? null } : null,
    over15: markets.over_under?.prob_over_15 != null ? pct(markets.over_under.prob_over_15) : null,
    over25: markets.over_under?.prob_over_25 != null ? pct(markets.over_under.prob_over_25) : null,
    over35: markets.over_under?.prob_over_35 != null ? pct(markets.over_under.prob_over_35) : null,
    btts: markets.btts?.prob_yes != null ? pct(markets.btts.prob_yes) : null,
    score: markets.score?.most_likely ?? null,
    cornersOver95: markets.corners?.prob_over_95 != null ? pct(markets.corners.prob_over_95) : null,
    confidence: data.model?.confidence ?? null,
    model: data.model?.version ?? null,
    capturedAt: new Date().toISOString(),
    source: 'Bzzoiro',
  };
}
export async function fetchEventPrediction(eventId, env = {}, fetchImpl = fetch) {
  return mapPrediction(await request(`${BASE}/events/${eventId}/prediction/`, env.BZZOIRO_API_TOKEN, fetchImpl));
}

/* ---- Lectura del mercado (consenso FT, sin casas ni cuotas en la vista) ---- */

/**
 * Consenso de cuotas tiempo completo (11 claves FT en plan free).
 * Devuelve el payload crudo; la conversión a % vive en `src/lib/odds.js`.
 * Null honesto ante cualquier forma irreconocible o fallo HTTP.
 */
export function mapOdds(data) {
  if (!data || typeof data !== 'object') return null;
  const odds = data.odds ?? data.consensus ?? data.markets ?? data;
  if (!odds || typeof odds !== 'object') return null;
  const pick = (...keys) => {
    for (const k of keys) if (odds[k] != null) return odds[k];
    return null;
  };
  const oneX2 = pick('match_result', 'oneX2', '1x2', 'fulltime_result', 'ft_result')
    ?? ((odds.home ?? odds.draw ?? odds.away) ? { home: odds.home, draw: odds.draw, away: odds.away } : null);
  const out = {
    oneX2: oneX2 ?? null,
    over25: pick('over_25', 'over25', 'total_25', 'ou_25') ?? null,
    over25Odds: pick('over25_odds', 'ou25_odds') ?? null,
    btts: pick('btts', 'both_teams_to_score', 'gg_ng') ?? null,
    bttsOdds: pick('btts_odds', 'gg_ng_odds') ?? null,
    cornersOver95: pick('corners_over_95', 'cornersOver95', 'over95_corners') ?? null,
    source: 'Bzzoiro-odds',
  };
  if (!out.oneX2 && out.over25 == null && out.btts == null) return null;
  return out;
}
export async function fetchEventOdds(eventId, env = {}, fetchImpl = fetch) {
  if (eventId == null || !env.BZZOIRO_API_TOKEN) return null;
  try {
    return mapOdds(await request(`${BASE}/events/${eventId}/odds/`, env.BZZOIRO_API_TOKEN, fetchImpl));
  } catch { return null; }
}
export async function fetchOddsComparison(eventId, env = {}, fetchImpl = fetch) {
  if (eventId == null || !env.BZZOIRO_API_TOKEN) return null;
  try {
    return mapOdds(await request(`${BASE}/odds/comparison/?event_id=${encodeURIComponent(eventId)}`, env.BZZOIRO_API_TOKEN, fetchImpl));
  } catch { return null; }
}

/* ---- Resolución de ligas e ids de equipo ---- */

/** Distinctive token sets per competition; exclusions keep second divisions and women's leagues out. */
const LEAGUE_MATCHERS = {
  laliga: { any: [['la', 'liga'], ['laliga']], exclude: ['hypermotion', 'segunda', 'femenina', 'women', 'federation', 'smartbank'] },
  premier: { any: [['premier', 'league'], ['premierleague']], exclude: ['femenina', 'women', '2', 'international', 'cup'] },
  champions: { any: [['champions', 'league']], exclude: ['women', 'femenina', 'youth', 'juvenile', 'u19', 'conmebol', 'caf', 'afc', 'africa', 'asia'] },
  europa: { any: [['europa', 'league']], exclude: ['conference', 'women', 'femenina', 'youth'] },
  libertadores: { any: [['libertadores']], exclude: ['femenina', 'women', 'sub', 'sub20', 'sub17'] },
};
/** True when a league name carries all tokens of one candidate and none of the exclusions. */
export function leagueNameMatches(name, competitionId) {
  const matcher = LEAGUE_MATCHERS[competitionId];
  if (!matcher) return false;
  const tokens = [...teamTokens(name)];
  const candidates = matcher.any;
  const exclusions = [...teamTokens(matcher.exclude.join(' '))];
  if (exclusions.some(token => tokens.includes(token))) return false;
  return candidates.some(needed => needed.every(token => tokens.includes(token)));
}
/** Paged league catalog scan (free, no name search param exists). */
export async function resolveLeagues({ env = {}, fetchImpl = fetch, logger = console, maxRows = 1200 }) {
  if (!env.BZZOIRO_API_TOKEN) return {};
  const resolved = {};
  for (let offset = 0; offset < maxRows; offset += 200) {
    let rows = [];
    try {
      const page = await request(`${BASE}/leagues/?limit=200&offset=${offset}`, env.BZZOIRO_API_TOKEN, fetchImpl);
      rows = Array.isArray(page?.results) ? page.results : [];
    } catch (error) { logger.warn(`Bzzoiro ligas: ${error.message}`); break; }
    for (const row of rows) {
      const competitionId = Object.keys(LEAGUE_MATCHERS).find(id => !resolved[id] && row?.is_women !== true && leagueNameMatches(row.name ?? '', id));
      if (competitionId) resolved[competitionId] = { id: row.id, name: row.name, source: 'Bzzoiro' };
    }
    if (!rows.length || rows.length < 200) break;
  }
  return resolved;
}

/** name → Bzzoiro team id, from any event list rows; feeds the crest hotlink. */
export function collectTeamIds(events) {
  const map = {};
  for (const row of events ?? []) {
    const pairs = [[row?.home_team, row?.home_team_id], [row?.away_team, row?.away_team_id]];
    for (const [name, id] of pairs) if (name && id != null && !map[normalize(name)]) map[normalize(name)] = { id, name, source: 'Bzzoiro' };
  }
  return map;
}

function standingsRow(row) {
  return {
    position: row.position ?? null,
    team: row.team_name ?? row.team?.name ?? null,
    teamId: row.team_id ?? row.team?.id ?? null,
    played: row.played ?? row.matches ?? null,
    won: row.won ?? null,
    drawn: row.drawn ?? row.draws ?? null,
    lost: row.lost ?? row.losses ?? null,
    goalsFor: row.goals_for ?? row.goalsFor ?? row.scored ?? null,
    goalsAgainst: row.goals_against ?? row.goalsAgainst ?? row.conceded ?? null,
    goalDifference: row.goals_for != null && row.goals_against != null ? row.goals_for - row.goals_against
      : row.goal_difference ?? row.goalDifference ?? null,
    points: row.pts ?? row.points ?? null,
    zone: row.zone ?? null,
    form: Array.isArray(row.form) ? row.form : null,
  };
}

export function mapBzzoiroStandings(data, top = 20) {
  // Las copas devuelven grupos por letra; se guardan crudos y las filas se
  // aplanan para que los consumidores de `rows` no cambien.
  const groups = Array.isArray(data?.groups) ? data.groups : Array.isArray(data?.standings_groups) ? data.standings_groups : null;
  if (groups?.length) {
    const mapped = groups.map(group => ({
      group: group.group ?? group.group_name ?? group.name ?? null,
      rows: (Array.isArray(group.standings) ? group.standings : Array.isArray(group.rows) ? group.rows : []).slice(0, top).map(standingsRow),
    })).filter(group => group.rows.length);
    if (!mapped.length) return null;
    return mapped.flatMap(group => group.rows);
  }
  const rows = data?.standings;
  if (!Array.isArray(rows) || !rows.length) return null; // sin tabla plana ni grupos: ausencia honesta
  return rows.slice(0, top).map(standingsRow);
}
/** Current season id + flat table for one resolved league (Europa League path when FD doesn't cover it). */
export async function fetchBzzoiroStandings(leagueId, { env = {}, fetchImpl = fetch, logger = console, top = 20 } = {}) {
  if (!env.BZZOIRO_API_TOKEN || !leagueId) return null;
  try {
    const season = await request(`${BASE}/leagues/${leagueId}/season/`, env.BZZOIRO_API_TOKEN, fetchImpl);
    const table = await request(`${BASE}/leagues/${leagueId}/standings/?season_id=${season.id}`, env.BZZOIRO_API_TOKEN, fetchImpl);
    const rows = mapBzzoiroStandings(table, top);
    if (!rows) return null;
    const payload = { season: season.year ?? season.id ?? null, provider: 'Bzzoiro', updatedAt: new Date().toISOString(), rows };
    const groups = Array.isArray(table?.groups) ? table.groups : Array.isArray(table?.standings_groups) ? table.standings_groups : null;
    if (groups?.length) payload.groups = groups.map(group => ({
      group: group.group ?? group.group_name ?? group.name ?? null,
      rows: (Array.isArray(group.standings) ? group.standings : Array.isArray(group.rows) ? group.rows : []).slice(0, top).map(standingsRow),
    })).filter(group => group.rows.length);
    if (table?.zones ?? table?.zone_legend) payload.zones = table.zones ?? table.zone_legend;
    return payload;
  } catch (error) { logger.warn(`Tabla Bzzoiro (${leagueId}): ${error.message}`); return null; }
}

export function mapLeaderboard(data, limit = 5) {
  // La v2 nombra la lista «leaders» (con la temporada vigente adjunta); las
  // respuestas antiguas usaban «results» o un arreglo plano.
  const rows = Array.isArray(data?.leaders) ? data.leaders : Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  if (!rows.length) return null;
  return rows.slice(0, limit).map(row => ({
    rank: row.rank ?? null,
    player: row.player_name ?? null,
    playerId: row.player_id ?? null,
    position: row.position ?? null,
    team: row.team_name ?? null,
    teamId: row.team_id ?? null,
    value: row.value ?? null,
    matches: row.matches ?? null,
  }));
}
export async function fetchLeaderboard(leagueId, stat, { env = {}, fetchImpl = fetch, logger = console, limit = 5, seasonId = null } = {}) {
  if (!env.BZZOIRO_API_TOKEN || !leagueId) return null;
  try {
    const data = await request(`${BASE}/leagues/${leagueId}/top/${stat}/?limit=${Math.max(1, limit)}${seasonId ? `&season_id=${seasonId}` : ''}`, env.BZZOIRO_API_TOKEN, fetchImpl);
    return mapLeaderboard(data, limit);
  } catch (error) { logger.warn(`Goleadores Bzzoiro (${leagueId}/${stat}): ${error.message}`); return null; }
}
