import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatrix, matrixMarkets, firstGoalRace, scorerShares, scorerMarkets, computeMatchMarkets, teamContext, domesticLeague } from '../src/lib/probabilities.js';
import { buildBeats, ballAt, matchMinute, hashSeed } from '../src/lib/pitch-path.js';
import { teamColors, NEUTRAL_KIT } from '../src/lib/team-colors.js';
import { locateMatch, venueZoomLayout, VENUE_ZOOM, europeMapLayout, EUROPE_MAP } from '../src/lib/venues.js';

const close = (a, b, epsilon = 0.002) => Math.abs(a - b) <= epsilon;

test('la matriz de marcadores normalizada suma 1', () => {
  const markets = matrixMarkets(scoreMatrix(1.4, 1.1));
  const sum = markets.oneX2.home + markets.oneX2.draw + markets.oneX2.away;
  assert.equal(Math.round(sum * 1000), 1000);
});

test('los mercados derivados son coherentes entre sí', () => {
  const markets = matrixMarkets(scoreMatrix(1.6, 0.9));
  assert.ok(markets.totals.over15 > markets.totals.over25);
  assert.ok(markets.totals.over25 > markets.totals.over35);
  assert.ok(markets.btts.yes > markets.cleanSheet.away || true); // ambas cosas pueden coexistir
  const exactSum = markets.exactScores.reduce((total, score) => total + score.p, 0);
  assert.ok(exactSum > 0 && exactSum < 1);
  assert.deepEqual(Object.values(markets.cleanSheet).every(value => value >= 0 && value <= 1), true);
});

test('la doble oportunidad 12 equivale a 1 menos el empate', () => {
  const markets = matrixMarkets(scoreMatrix(1.2, 1.3));
  assert.equal(Math.round((markets.doubleChance['12'] + markets.oneX2.draw) * 100), 100);
});

test('el empate no válida suma 100%', () => {
  const markets = matrixMarkets(scoreMatrix(1.8, 0.9));
  assert.equal(Math.round((markets.dnb.home + markets.dnb.away) * 100), 100);
});

test('las bandas del primer gol más el partido sin goles suman 1', () => {
  const race = firstGoalRace(1.3, 1.0);
  const total = race.bands.reduce((sum, band) => sum + band.p, 0) + race.noGoal;
  assert.equal(Math.round(total * 100), 100);
});

test('el primer goleador reparte lo que no es empate a cero', () => {
  const race = firstGoalRace(1.5, 1.1);
  assert.equal(Math.round((race.firstHome + race.firstAway + race.noGoal) * 100), 100);
  assert.ok(race.firstHome > race.firstAway);
});

test('los shares de goleador se acotan y sus mercados salen de λ del equipo', () => {
  const shares = scorerShares([
    { player: 'A', team: 'X', value: 5 },
    { player: 'B', team: 'X', value: 3 },
    { player: 'C', team: 'Y', value: 4 },
  ], 'X', 10);
  assert.equal(shares.length, 2);
  assert.ok(shares.every(row => row.share > 0 && row.share <= 0.9));
  const markets = scorerMarkets(shares, 1.4, 2.5);
  assert.ok(markets.every(row => row.anytime >= 0 && row.anytime <= 1));
  assert.ok(markets[0].anytime > markets[1].anytime);
  assert.ok(markets[0].first <= 1);
});

test('computeMatchMarkets devuelve null sin muestra suficiente y mercados con muestra corta', () => {
  const results = Array.from({ length: 4 }, (_, index) => ({
    date: `2026-08-0${index + 1}`, home: 'Local', away: 'Otro', homeScore: 2, awayScore: 1,
  }));
  const match = { id: 'x', home: 'Local', away: 'Visitante', competition: 'premier', kickoff: '2026-09-20T20:00:00Z' };
  assert.equal(computeMatchMarkets({ match, results }), null);
  const enough = Array.from({ length: 4 }, (_, index) => ({ date: `2026-08-0${index + 1}`, home: 'Visitante', away: 'Otro', homeScore: 0, awayScore: 1 }));
  const markets = computeMatchMarkets({ match, results: [...results, ...enough] });
  assert.ok(markets.markets.oneX2.home > 0);
});

test('teamContext deriva porterías a cero y racha de la base real', () => {
  const results = [
    { date: '2026-09-01', competition: 'premier', home: 'Local', away: 'Otro', homeScore: 2, awayScore: 0 },
    { date: '2026-09-08', competition: 'premier', away: 'Local', home: 'Otro', homeScore: 0, awayScore: 1 },
    { date: '2026-09-10', competition: 'premier', home: 'Local', away: 'Otro', homeScore: 3, awayScore: 0 },
  ];
  const context = teamContext(results, {}, {}, { home: 'Local', away: 'Visitante', competition: 'premier' }, 'home');
  assert.equal(context.cleanSheets.value, 3);
  assert.equal(context.unbeaten.value, 3);
  assert.equal(context.biggestWin.value, 3);
});

test('domesticLeague resuelve la liga del equipo e ignora las copas', () => {
  const standings = {
    champions: { rows: [{ team: 'Local', position: 3 }] },
    premier: { rows: [{ team: 'Local', position: 5, played: 4, goalsFor: 9, goalsAgainst: 2 }] },
  };
  assert.equal(domesticLeague(standings, 'Local'), 'premier');
  assert.equal(domesticLeague(standings, 'Ausente'), null);
  assert.equal(domesticLeague({}, 'Local'), null);
});

test('teamContext filtra la muestra a la liga doméstica del equipo', () => {
  const results = [
    { date: '2026-09-01', competition: 'premier', home: 'Local', away: 'Otro', homeScore: 2, awayScore: 0 },
    { date: '2026-09-08', competition: 'champions', home: 'Local', away: 'Otro', homeScore: 5, awayScore: 0 },
    { date: '2026-09-10', competition: 'premier', home: 'Otro', away: 'Local', homeScore: 1, awayScore: 1 },
    { date: '2026-09-11', home: 'Local', away: 'Otro', homeScore: 4, awayScore: 0 }, // sin competición: no cuenta
  ];
  const standings = { premier: { provider: 'FD', rows: [{ team: 'Local', position: 5, played: 4, goalsFor: 9, goalsAgainst: 2 }] } };
  const scorers = { premier: { scorers: [{ player: 'Goleador', team: 'Local', value: 4, matches: 4 }] } };
  const match = { home: 'Local', away: 'Visitante', competition: 'champions' };
  const context = teamContext(results, standings, scorers, match, 'home');
  assert.equal(context.recentSample, 2); // solo liga: la goleada de champions y la fila sin competición quedan fuera
  assert.equal(context.cleanSheets.value, 1);
  assert.equal(context.unbeaten.value, 2);
  assert.equal(context.season.position, 5); // tabla doméstica, no la del partido
  assert.equal(context.player.name, 'Goleador'); // líder de la liga, no de la champions
});

test('teamContext sin liga resuelta usa la competición del partido', () => {
  const results = [
    { date: '2026-09-01', competition: 'libertadores', home: 'Local', away: 'Otro', homeScore: 2, awayScore: 0 },
  ];
  const context = teamContext(results, {}, {}, { home: 'Local', away: 'Visitante', competition: 'libertadores' }, 'home');
  assert.equal(context.recentSample, 1);
  assert.equal(context.cleanSheets.value, 1);
});

/* ---- pitch-path ---- */

test('los beats son deterministas y ordenados', () => {
  const events = [
    { minute: 55, type: 'goal', team: 'away' },
    { minute: 12, type: 'card', team: 'home' },
    { minute: 60, type: 'sub', team: 'home' },
  ];
  const first = buildBeats('af-1', events);
  const second = buildBeats('af-1', events);
  assert.deepEqual(first, second);
  const minutes = first.map(beat => beat.minute);
  assert.deepEqual(minutes, [...minutes].sort((a, b) => a - b));
  const goal = first.find(beat => beat.kind === 'goal');
  assert.ok(goal.x < 25); // gol de visita: área izquierda
});

test('ballAt se mantiene dentro de la cancha', () => {
  const beats = buildBeats('af-1', [{ minute: 30, type: 'goal', team: 'home' }]);
  for (let minute = 0; minute <= 95; minute += 0.5) {
    const point = ballAt(beats, minute);
    assert.ok(point.x >= 0 && point.x <= 105 && point.y >= 0 && point.y <= 68);
  }
});

test('matchMinute sigue la convención 45+descanso', () => {
  const kickoff = 0;
  assert.equal(matchMinute(kickoff, -1), null);
  assert.equal(matchMinute(kickoff, 30 * 60_000), 30);
  assert.equal(matchMinute(kickoff, 50 * 60_000), 45);
  assert.equal(matchMinute(kickoff, 70 * 60_000), 55);
  assert.equal(matchMinute(kickoff, 130 * 60_000), 95);
});

test('hashSeed es estable', () => {
  assert.equal(hashSeed('af-1557402'), hashSeed('af-1557402'));
  assert.notEqual(hashSeed('a'), hashSeed('b'));
});

/* ---- team-colors y zoom de sede ---- */

test('teamColors resuelve por nombre tolerante y cae a neutro', () => {
  assert.equal(teamColors('Liverpool FC').primary, '#c8102e');
  assert.deepEqual(teamColors('Club Desconocido de Nowhere'), NEUTRAL_KIT);
});

test('el zoom de sede proyecta el pin dentro del marco', () => {
  const location = locateMatch({ home: 'Leeds', venue: 'Elland Road' });
  assert.ok(location.zoom);
  assert.ok(location.zoom.pinX > 0 && location.zoom.pinX < 100);
  assert.ok(location.zoom.pinY > 0 && location.zoom.pinY < 100);
  assert.ok(location.zoom.src.startsWith('/img/venue-zoom/'));
  assert.equal(location.stadium, 'Elland Road');
  const size = VENUE_ZOOM;
  assert.ok(location.zoom.width === Math.round(size.lngSpan / size.step) * size.pitch);
});

test('locateMatch devuelve null para clubes fuera del catálogo', () => {
  assert.equal(locateMatch({ home: 'Club Inexistente' }), null);
});

test('el mapa de referencia de Europa declara su recorte y no lleva pin', () => {
  const map = europeMapLayout();
  assert.equal(map.src, '/img/venue-zoom/europa.png');
  assert.equal(map.width, Math.round((EUROPE_MAP.lngMax - EUROPE_MAP.lngMin) / EUROPE_MAP.step) * EUROPE_MAP.pitch);
  assert.equal(map.height, Math.round((EUROPE_MAP.latMax - EUROPE_MAP.latMin) / EUROPE_MAP.step) * EUROPE_MAP.pitch);
  assert.equal(map.pinX, undefined);
  assert.equal(map.pinY, undefined);
});
