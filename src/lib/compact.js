/**
 * Serializador compacto telegráfico para el input del LLM.
 * JSON gasta tokens en comillas/llaves/claves repetidas; aquí cada fila es
 * `BLOQUE|campo|campo` separada por `\n`, sin JSON. Ahorro estimado 30-50%.
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

/** Últimos N resultados de un equipo, más recientes primero. */
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
 * Construye el input telegráfico de un partido. Orden = prioridad de
 * truncado: lo esencial (M/P/B) primero; lo recortable (S/R/HR) al final.
 */
export function toCompactInput(match, markets = null, { results = [], standings = null, scorers = null } = {}) {
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
  if (match.h2h?.totalMatches) {
    const h = match.h2h;
    lines.push(`H|${h.totalMatches}|${h.homeWins ?? ''}|${h.draws ?? ''}|${h.awayWins ?? ''}|${num(h.avgTotalGoals, 2)}`);
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
  // Truncado inverso: recorta desde el final (HR/R/S) hasta caber.
  while (out.length > COMPACT_MAX_CHARS && lines.length > 3) {
    lines.pop();
    out = lines.join('\n');
  }
  return out;
}
