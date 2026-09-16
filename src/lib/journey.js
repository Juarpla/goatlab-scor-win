/**
 * Región de jornada de la portada: mapa de sedes, pulso de la base y
 * termómetro de curiosidades. Todo se calcula sobre los JSON locales en la
 * build; nada de esta página consulta al proveedor en runtime.
 */
import { normalize, teamDisplay } from './teams.js';
import { competitions } from './football.js';
import { locateMatch, MAP_CROP } from './venues.js';

const FINISHED = new Set(['FT', 'AET', 'PEN']);

/**
 * Pines por ciudad para el mapa: agrupa los próximos encuentros por sede de
 * localía y proyecta la ciudad sobre el recorte equirectangular del PNG
 * (x = (lng+180)/360, y = ((90-lat)/2 − fila superior)/filas). Los partidos sin
 * sede resuelta viajan aparte para la fila «sin ubicación».
 */
export function buildMapData(matches = []) {
  const live = (matches ?? []).filter(match => !FINISHED.has(match.status) && match.kickoff);
  const pins = new Map();
  const unlocated = [];
  for (const match of live) {
    const location = locateMatch(match);
    if (!location) { unlocated.push(match); continue; }
    const id = normalize(location.city);
    if (!pins.has(id)) {
      pins.set(id, {
        id, city: location.city, country: location.country,
        x: Math.round((location.lng + 180) / 360 * 1e5) / 1e3,
        y: Math.round(((90 - location.lat) / 2 - (90 - MAP_CROP.latTop) / 2) / MAP_CROP.rows * 1e5) / 1e3,
        matches: [],
      });
    }
    const pin = pins.get(id);
    pin.matches.push({
      id: match.id, home: match.home, away: match.away, kickoff: match.kickoff,
      stadium: location.stadium, capacity: location.capacity,
    });
  }
  return { pins: [...pins.values()], unlocated };
}

function playedRows(results) {
  return (results ?? [])
    .filter(row => row.homeScore != null && row.awayScore != null && row.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function perTeam(rows) {
  const teams = new Map();
  for (const row of rows) {
    for (const side of [true, false]) {
      const name = side ? row.home : row.away;
      const key = normalize(name);
      if (!key) continue;
      if (!teams.has(key)) teams.set(key, []);
      teams.get(key).push({
        name, date: row.date,
        scored: side ? row.homeScore : row.awayScore,
        conceded: side ? row.awayScore : row.homeScore,
      });
    }
  }
  return teams;
}

const day = (date, amount) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};
const shortDate = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short' });
const competitionName = id => competitions.find(competition => competition.id === id)?.name ?? id;

/**
 * Los nombres: líderes reales de jugadores entre las ligas cubiertas.
 * Cada fila nombra al jugador y a su club, con la competición en el detalle.
 * Solo se publica lo que la fuente entregó; el «más eficaz» compara goles
 * por partido entre goleadores con tres partidos o más y no repite al goleador.
 */
export function computePlayerPulse(scorersData = {}) {
  const entries = Object.entries(scorersData ?? {}).filter(([, table]) => (table.scorers?.length ?? 0) > 0 || (table.assists?.length ?? 0) > 0);
  if (!entries.length) return [];
  const rows = [];

  let scorer = null;
  for (const [competition, table] of entries) {
    for (const row of table.scorers ?? []) {
      if (!scorer || (row.value ?? 0) > (scorer.value ?? 0)) scorer = { ...row, competition };
    }
  }
  if (scorer?.value > 0) rows.push({
    label: 'El goleador', fact: scorer.player,
    detail: `${teamDisplay(scorer.team)} · ${scorer.value} goles en ${scorer.matches ?? '?'} partidos · ${competitionName(scorer.competition)}`,
  });

  let assister = null;
  for (const [competition, table] of entries) {
    for (const row of table.assists ?? []) {
      if (!assister || (row.value ?? 0) > (assister.value ?? 0)) assister = { ...row, competition };
    }
  }
  if (assister?.value > 0) rows.push({
    label: 'El asistente', fact: assister.player,
    detail: `${teamDisplay(assister.team)} · ${assister.value} asistencias · ${competitionName(assister.competition)}`,
  });

  let efficient = null;
  for (const [competition, table] of entries) {
    for (const row of table.scorers ?? []) {
      if ((row.matches ?? 0) < 3) continue;
      if (scorer && row.playerId === scorer.playerId) continue; // el goleador ya tiene fila
      const ratio = (row.value ?? 0) / row.matches;
      if (!efficient || ratio > efficient.ratio) efficient = { ...row, competition, ratio };
    }
  }
  if (efficient?.value > 0) rows.push({
    label: 'El más eficaz', fact: efficient.player,
    detail: `${teamDisplay(efficient.team)} · ${efficient.value} goles en ${efficient.matches} partidos · ${competitionName(efficient.competition)}`,
  });

  return rows.slice(0, 4);
}

/**
 * El pulso: racha ganadora vigente más larga, el partido con más goles, la
 * goleada más ancha y el equipo con más victorias en sus últimos 10. Cada hito
 * prefiere el más reciente cuando empatan.
 */
export function computePulse(results = []) {
  const rows = playedRows(results);
  if (!rows.length) return [];
  const teams = perTeam(rows);
  const items = [];

  let streak = null;
  for (const games of teams.values()) {
    let run = 0;
    for (let index = games.length - 1; index >= 0 && games[index].scored > games[index].conceded; index--) run++;
    if (run > (streak?.run ?? 0) && run > 1) streak = { team: games[games.length - 1].name, run };
  }
  if (streak) items.push({ label: 'La racha más larga', fact: teamDisplay(streak.team), detail: `${streak.run} victorias seguidas` });

  let goals = null;
  for (const row of rows) {
    const total = row.homeScore + row.awayScore;
    if (total > (goals?.total ?? 0)) goals = { ...row, total };
  }
  if (goals) items.push({
    label: 'Más goles',
    fact: `${teamDisplay(goals.home)} ${goals.homeScore}-${goals.awayScore} ${teamDisplay(goals.away)}`,
    detail: `${goals.total} goles · ${shortDate(goals.date)}`,
  });

  let blowout = null;
  for (const row of rows) {
    const margin = Math.abs(row.homeScore - row.awayScore);
    if (margin > (blowout?.margin ?? 1)) blowout = { ...row, margin };
  }
  if (blowout) items.push({
    label: 'La goleada',
    fact: `${teamDisplay(blowout.home)} ${blowout.homeScore}-${blowout.awayScore} ${teamDisplay(blowout.away)}`,
    detail: `diferencia de ${blowout.margin} · ${shortDate(blowout.date)}`,
  });

  let inForm = null;
  for (const games of teams.values()) {
    const last = games.slice(-10);
    if (last.length < 5) continue;
    const wins = last.filter(game => game.scored > game.conceded).length;
    const scored = last.reduce((sum, game) => sum + game.scored, 0);
    if (wins > (inForm?.wins ?? 0) || (wins === inForm?.wins && scored > inForm.scored)) inForm = { team: last[last.length - 1].name, wins, scored, sample: last.length };
  }
  if (inForm) items.push({ label: 'El equipo de moda', fact: teamDisplay(inForm.team), detail: `${inForm.wins} victorias en sus últimos ${inForm.sample} partidos` });

  return items.slice(0, 4);
}

/** Termómetro: tres cifras reales de la base para la banda rotativa. */
export function computeCuriosities(results = []) {
  const rows = playedRows(results);
  if (!rows.length) return [];
  const latest = rows[rows.length - 1].date;
  const slides = [];

  const recent = rows.filter(row => row.date >= day(latest, -6));
  const recentGoals = recent.reduce((sum, row) => sum + row.homeScore + row.awayScore, 0);
  if (recentGoals > 0) slides.push({ figure: recentGoals, line: `goles en los últimos 7 días de la base (${recent.length} partidos).` });

  const last60 = rows.filter(row => row.date >= day(latest, -59));
  const both = last60.filter(row => row.homeScore > 0 && row.awayScore > 0);
  if (last60.length >= 10) slides.push({ figure: `${Math.round(both.length / last60.length * 100)}%`, line: `de partidos con ambos anotando en los últimos 60 días.` });

  let ever = null;
  for (const games of perTeam(rows).values()) {
    let run = 0;
    for (const game of games) {
      run = game.scored > game.conceded ? run + 1 : 0;
      if (run > (ever?.run ?? 0)) ever = { team: game.name, run };
    }
  }
  if (ever && ever.run > 3) slides.push({ figure: ever.run, line: `victorias seguidas, la racha más larga de la base (${ever.team}).` });

  return slides.slice(0, 3);
}
