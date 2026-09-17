/**
 * Backfill manual del histórico de estadísticas (Bzzoiro → history-stats.json).
 * Misma pareja y forma de fila que `updateHistory` en update-data.mjs, pero
 * autocontenido para corridas puntuales sin tocar el resto del pipeline.
 * Los días ya cubiertos no se repiten; los eventId existentes no se duplican.
 *
 * Uso: HISTORY_DAYS=90 HISTORY_BUDGET=300 node --env-file=.env scripts/backfill-history.mjs
 * Cada pareja cuesta 2 llamadas (stats + detalle); el presupuesto acota llamadas.
 */
import { readFile, writeFile } from 'node:fs/promises';
import {
  listEvents, mapPool, fetchEventStats, fetchEventDetail, sameTeam,
} from '../src/lib/bzzoiro.js';

const CONCURRENCY = Number(process.env.DATA_CONCURRENCY ?? 4);
const today = new Date().toISOString().slice(0, 10);

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

function historyRow(result, stats, detail = null, eventId = null) {
  return {
    date: result.date, competition: result.competition ?? null,
    home: result.home, away: result.away, homeScore: result.homeScore, awayScore: result.awayScore,
    halfTime: result.halfTime ?? null,
    eventId: eventId ?? null,
    statistics: stats?.statistics ?? null, halves: stats?.halves ?? null,
    detail: detail ?? null,
    source: 'Bzzoiro', updatedAt: new Date().toISOString(),
  };
}

const base = await readJson('public/data/results.json');
const results = base?.results ?? [];
const previous = await readJson('public/data/history-stats.json') ?? { rows: [], days: [] };
const rows = [...(previous.rows ?? [])];
const covered = new Set(previous.days ?? []);
const seenEvents = new Set(rows.map(row => row.eventId).filter(id => id != null));

const daysBack = Number(process.env.HISTORY_DAYS ?? 90);
const dates = Array.from({ length: daysBack }, (_, index) => {
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - daysBack + 1 + index);
  return day.toISOString().slice(0, 10);
}).filter(day => !covered.has(day));
if (!dates.length) {
  console.log('history-stats: sin días nuevos por cubrir.');
  process.exit(0);
}

const windows = [];
for (let index = 0; index < dates.length; index += 7) windows.push({ from: dates[index], to: dates[Math.min(dates.length - 1, index + 6)] });
const events = [];
for (const window of windows) events.push(...await listEvents({ dateFrom: window.from, dateTo: window.to, status: 'finished', env: process.env }));
console.log(`history-stats: ${events.length} eventos terminados en ${dates.length} días.`);

const byDate = new Map();
for (const row of results) {
  if (!byDate.has(row.date)) byDate.set(row.date, []);
  byDate.get(row.date).push(row);
}
const eventDay = event => (event.event_date ?? event.kickoff_time ?? event.kickoff ?? event.date ?? '').slice(0, 10);
const pairsAll = [];
for (const event of events) {
  if (event.id == null || seenEvents.has(event.id)) continue;
  const sameDay = byDate.get(eventDay(event)) ?? [];
  const match = sameDay.find(row => sameTeam(row.home, event.home_team) && sameTeam(row.away, event.away_team));
  if (match && !covered.has(match.date)) pairsAll.push({ match, eventId: event.id });
}
const budget = Number(process.env.HISTORY_BUDGET ?? 300);
const pairs = pairsAll.slice(0, Math.max(1, Math.floor(budget / 2)));
console.log(`history-stats: ${pairsAll.length} parejas; se capturan ${pairs.length}.`);

const details = await mapPool(pairs, CONCURRENCY, async pair => {
  const [stats, detail] = await Promise.all([
    fetchEventStats(pair.eventId, process.env).catch(() => null),
    fetchEventDetail(pair.eventId, process.env).catch(() => null),
  ]);
  return stats || detail ? { stats, detail } : null;
});
let written = 0;
details.forEach((detail, index) => {
  if (!detail) return;
  rows.push(historyRow(pairs[index].match, detail.stats, detail.detail, pairs[index].eventId));
  covered.add(pairs[index].match.date);
  written += 1;
});
await writeFile('public/data/history-stats.json', JSON.stringify({ rows: rows.slice(-600), days: [...covered].sort(), updatedAt: new Date().toISOString() }, null, 2));
console.log(`history-stats: ${written} partidos nuevos (total ${Math.min(rows.length, 600)}).`);
