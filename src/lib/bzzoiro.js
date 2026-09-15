/**
 * Bzzoiro Sports Data (REST gratuito): estadísticas con xG e incidentes por partido.
 * Los partidos se emparejan por nombre de equipo contra la agenda del día; si no hay
 * coincidencia confiable, el partido queda sin enriquecer (null) en lugar de inventar datos.
 */
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
function mapStats(data) {
  const stats = data?.stats;
  if (!stats?.home || !stats?.away) return null;
  const pick = side => ({
    possession: side.ball_possession ?? null,
    shots: side.total_shots ?? null,
    shotsOnTarget: side.shots_on_target ?? null,
    corners: side.corner_kicks ?? null,
    fouls: side.fouls ?? null,
    yellowCards: side.yellow_cards ?? null,
    redCards: side.red_cards ?? null,
    offsides: side.offsides ?? null,
    xg: side.xg?.actual ?? null,
  });
  const home = pick(stats.home);
  const away = pick(stats.away);
  // Pre-match the feed answers with all-null bags; that is "no statistics yet", not a table of dashes.
  const hasData = [...Object.values(home), ...Object.values(away)].some(value => value != null);
  return hasData ? { home, away, xgEstimated: data.xg_estimated ?? null, source: 'Bzzoiro' } : null;
}
const INCIDENT_TYPES = { goal: 'goal', card: 'card', substitution: 'sub' };
function mapIncidents(data) {
  const incidents = data?.incidents;
  if (!Array.isArray(incidents)) return null;
  const events = incidents.filter(item => INCIDENT_TYPES[item.type]).map(item => ({
    minute: item.minute ?? null,
    type: INCIDENT_TYPES[item.type],
    team: item.is_home === true ? 'home' : item.is_home === false ? 'away' : null,
    player: item.player ?? item.player_in ?? null,
    playerOut: item.player_out ?? null,
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
