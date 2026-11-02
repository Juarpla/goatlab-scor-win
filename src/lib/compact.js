/**
 * Compact telegraphic serializer for LLM input.
 * JSON spends tokens on repeated quotes/braces/keys; here each row is
 * `BLOCK|field|field` separated by `\n`, without JSON. Estimated saving 30-50%.
 */
import { sameClub } from './teams.js';

export const COMPACT_MAX_CHARS = 6000;

const clean = (value, max = 40) =>
  String(value ?? '')
    .replace(/[|\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const num = (value, digits = 3) => {
  if (value == null || !Number.isFinite(Number(value))) return '';
  const n = Number(value);
  return String(Math.round(n * 10 ** digits) / 10 ** digits);
};

const yesNo = value => (value == null ? '' : value ? 'si' : 'no');

/** Last N results for a team, most recent first. */
export function lastResults(results, team, n = 6) {
  return (results ?? [])
    .filter(row => row.homeScore != null && (sameClub(row.home, team) || sameClub(row.away, team)))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, n);
}

const standingsRow = (standings, competition, team) =>
  standings?.[competition]?.rows?.find(row => sameClub(row.team, team)) ?? null;

const topScorers = (scorers, competition, team, n = 3) =>
  (scorers?.[competition]?.scorers ?? [])
    .filter(row => sameClub(row.team, team) && Number.isFinite(row.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);

/**
 * Builds the telegraphic input for a match. Order = truncation
 * priority: essentials (M/P/B) first; trimmable blocks (S/R/HR) last.
 * Extra blocks (never trim essentials): W weather+venue, L absences,
 * M2 external consensus already normalized to %, B2 Bzzoiro model estimates, A API-Football
 * reading (with its raw reading, which the prompt reformulates). The LLM narrates
 * and audits, never calculates.
 */
export function toCompactInput(match, markets = null, { results = [], standings = null, scorers = null, weather = null, market = null } = {}) {
  const lines = [];
  lines.push(
    `M|${clean(match.id, 24)}|${clean(match.home)}|${clean(match.away)}|${clean(match.competition, 16)}|${clean(match.kickoff, 24)}|${clean(match.status, 8)}`,
  );
  if (markets?.lambdas && markets?.markets) {
    const m = markets.markets;
    lines.push(
      `P|${num(markets.lambdas.home)}|${num(markets.lambdas.away)}|${num(m.oneX2?.home)}|${num(m.oneX2?.draw)}|${num(m.oneX2?.away)}|${num(m.totals?.over25)}|${num(m.btts?.yes)}`,
    );
  }
  const cb = match.modelPrediction;
  if (cb) {
    lines.push(
      `B|${num(cb.oneX2?.home)}|${num(cb.oneX2?.draw)}|${num(cb.oneX2?.away)}|${num(cb.xg?.home, 2)}|${num(cb.xg?.away, 2)}|${num(cb.over25)}|${num(cb.btts)}|${clean(cb.score, 12)}|${num(cb.cornersOver95)}`,
    );
  }
  // Bzzoiro model estimates (booleans + highest probability); they accompany, they are not GoatLab numbers.
  if (cb?.recommendations) {
    lines.push(`B2|${clean(cb.recommendations.favorite, 16)}|${num(cb.recommendations.favoriteProb)}|${yesNo(cb.recommendations.over25)}|${yesNo(cb.recommendations.btts)}`);
  }
  // API-Football reading: distribution, highest probability, goal threshold and its raw reading.
  const af = match.afPrediction;
  if (af) {
    lines.push(`A|${num(af.percent?.home)}|${num(af.percent?.draw)}|${num(af.percent?.away)}|${clean(af.winner, 40)}|${yesNo(af.winOrDraw)}|${clean(af.underOver, 8)}|${clean(af.goals?.home, 8)}|${clean(af.goals?.away, 8)}|${clean(af.advice, 120)}`);
  }
  if (match.h2h?.totalMatches) {
    const h = match.h2h;
    lines.push(`H|${h.totalMatches}|${h.homeWins ?? ''}|${h.draws ?? ''}|${h.awayWins ?? ''}|${num(h.avgTotalGoals, 2)}`);
  }
  // Weather + venue (weather.json sidecar + catalog venue).
  const w = weather?.[match.id] ?? match.weatherEntry ?? null;
  const venueName = match.venue ?? null;
  if (w && (w.temp != null || w.condition != null || w.wind != null || venueName)) {
    lines.push(`W|${num(w.temp, 0)}|${clean(w.condition, 24)}|${num(w.wind, 0)}|${clean(venueName, 40)}`);
  }
  // Confirmed absences (Bzzoiro lineups); never estimated.
  const unavailable = match.lineups?.unavailablePlayers ?? match.availability?.unavailablePlayers ?? null;
  if (Array.isArray(unavailable) && unavailable.length) {
    const homeOut = unavailable.filter(p => p.team === 'home').length;
    const awayOut = unavailable.filter(p => p.team === 'away').length;
    const names = unavailable.slice(0, 3).map(p => clean(p.name, 24)).join(',');
    lines.push(`L|${homeOut}|${awayOut}|${names}`);
  }
  // External consensus in interpretive % (no margin or odds). M2 never carries decimal odds.
  const m2 = market ?? match.marketConsensus ?? null;
  if (m2?.oneX2 || m2?.over25 != null || m2?.btts != null) {
    lines.push(
      `M2|${num(m2.oneX2?.home)}|${num(m2.oneX2?.draw)}|${num(m2.oneX2?.away)}|${num(m2.over25)}|${num(m2.btts)}`,
    );
  }
  for (const team of [match.home, match.away]) {
    const row = standingsRow(standings, match.competition, team);
    if (row) lines.push(`T|${row.position ?? ''}|${clean(team)}|${row.played ?? ''}|${row.points ?? ''}|${row.goalsFor ?? ''}|${row.goalsAgainst ?? ''}`);
  }
  for (const team of [match.home, match.away]) {
    for (const row of topScorers(scorers, match.competition, team)) {
      lines.push(`S|${clean(row.player)}|${clean(team)}|${row.value}|${row.matches ?? ''}`);
    }
  }
  const seen = new Set();
  const combined = [...lastResults(results, match.home), ...lastResults(results, match.away)]
    .filter(row => {
      const key = row.id ?? `${row.date}|${row.home}|${row.away}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const row of combined) {
    lines.push(`R|${clean(row.date, 10)}|${clean(row.home)}|${clean(row.away)}|${row.homeScore ?? ''}|${row.awayScore ?? ''}`);
  }
  for (const row of (match.h2h?.recent ?? []).slice(0, 5)) {
    if (row.homeScore == null) continue;
    lines.push(`HR|${clean(row.date, 10)}|${clean(row.home)}|${clean(row.away)}|${row.homeScore}|${row.awayScore}`);
  }
  let out = lines.join('\n');
  // Reverse truncation: trims from the end (HR/R/S) until it fits.
  while (out.length > COMPACT_MAX_CHARS && lines.length > 3) {
    lines.pop();
    out = lines.join('\n');
  }
  return out;
}
