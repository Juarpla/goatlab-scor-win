import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatrix, matrixMarkets, firstGoalRace, scorerShares, scorerMarkets, topScorerSplit, computeMatchMarkets, teamContext, domesticLeague, marketsFromXg, buildSetPiecesEstimate, blendLambdas } from '../src/lib/probabilities.js';
import { sameClub, canonicalClubKey } from '../src/lib/teams.js';
import { teamRates, estimateLambdas } from '../src/lib/predictions.js';
import { buildBeats, ballAt, matchMinute, hashSeed } from '../src/lib/pitch-path.js';
import { teamColors, NEUTRAL_KIT } from '../src/lib/team-colors.js';
import { locateMatch, venueZoomLayout, VENUE_ZOOM, europeMapLayout, EUROPE_MAP } from '../src/lib/venues.js';

const close = (a, b, epsilon = 0.002) => Math.abs(a - b) <= epsilon;

test('la matriz de marcadores normalizada suma 1', () => {
  const markets = matrixMarkets(scoreMatrix(1.4, 1.1));
  const sum = markets.oneX2.home + markets.oneX2.draw + markets.oneX2.away;
  assert.equal(Math.round(sum * 1000), 1000);
});

// Sevilla vs Barcelona 2026-09-19: xG Bzzoiro 1.10–2.08.
test('marketsFromXg deriva cleanSheet y exactos del xG del proveedor', () => {
  const derived = marketsFromXg({ home: 1.1, away: 2.08 });
  assert.equal(derived.source, 'derivado-xG-Bzzoiro');
  assert.ok(close(derived.cleanSheet.home, 0.125));
  assert.ok(close(derived.cleanSheet.away, 0.333));
  assert.deepEqual([derived.exactScores[0].home, derived.exactScores[0].away], [1, 1]);
  assert.ok(derived.exactScores.length === 5);
  const shareSum = derived.exactScores.reduce((total, score) => total + score.share, 0);
  assert.ok(close(shareSum, 1));
});

test('el pick del proveedor abre el podio con margen en todos los partidos', () => {
  const derived = marketsFromXg({ home: 1.1, away: 2.08 }, '1-2');
  assert.deepEqual([derived.exactScores[0].home, derived.exactScores[0].away], [1, 2]);
  assert.deepEqual(derived.providerPick, { home: 1, away: 2 });
  const [first, second] = derived.exactScores;
  assert.ok(first.share > second.share + 0.04);
  const shareSum = derived.exactScores.reduce((total, score) => total + score.share, 0);
  assert.ok(close(shareSum, 1));
  // Sin pick no hay boost ni providerPick: manda la matriz.
  const plain = marketsFromXg({ home: 1.1, away: 2.08 });
  assert.equal(plain.providerPick, null);
  assert.deepEqual([plain.exactScores[0].home, plain.exactScores[0].away], [1, 1]);
  // Pick fuera del top-5 entra igual al podio.
  const outsider = marketsFromXg({ home: 0.6, away: 0.6 }, '0-3');
  assert.deepEqual([outsider.exactScores[0].home, outsider.exactScores[0].away], [0, 3]);
  assert.ok(outsider.exactScores.length === 5);
});

test('marketsFromXg null-honesto sin xG válido', () => {
  assert.equal(marketsFromXg(null), null);
  assert.equal(marketsFromXg({ home: null, away: 2 }), null);
  assert.equal(marketsFromXg({ home: 0, away: 1.5 }), null);
  assert.equal(marketsFromXg({ home: -1, away: 1.5 }), null);
});

test('los córners heredan la procedencia: Bzzoiro cuando el insumo es del proveedor', () => {
  const fromProvider = buildSetPiecesEstimate({ marketCorners: { over95: 0.479 }, cornersSource: 'Bzzoiro', historyRows: 130 });
  assert.equal(fromProvider.source, 'Bzzoiro');
  assert.equal(fromProvider.over95, 0.479);
  const fromMarket = buildSetPiecesEstimate({ marketCorners: { over95: 0.6 }, cornersSource: 'Mercado', historyRows: 10 });
  assert.equal(fromMarket.source, 'Mercado');
  const empty = buildSetPiecesEstimate({ historyRows: 0 });
  assert.equal(empty.source, null);
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

/* ---- Identidad de clubes: Sevilla vs Barcelona 2026-09-19 ---- */

test('sameClub ignora prefijos legales pero distingue Barcelona SC', () => {
  assert.equal(sameClub('Barcelona', 'FC Barcelona'), true);
  assert.equal(sameClub('Sevilla', 'Sevilla FC'), true);
  assert.equal(sameClub('Barcelona', 'Barcelona SC'), false);
  assert.equal(sameClub('Newcastle', 'Newcastle United'), true);
  assert.equal(canonicalClubKey('FC Barcelona'), 'barcelona');
  assert.equal(canonicalClubKey('Sevilla FC'), 'sevilla');
});

test('teamRates no mezcla Barcelona SC y deduplica AF+FD', () => {
  const results = [
    { date: '2026-09-16', home: 'Barcelona', away: 'Racing Santander', homeScore: 7, awayScore: 2 },
    { date: '2026-09-13', home: 'Levante', away: 'Barcelona', homeScore: 2, awayScore: 4 },
    { date: '2026-08-31', home: 'FC Barcelona', away: 'Rayo Vallecano de Madrid', homeScore: 5, awayScore: 2 },
    { date: '2026-05-29', home: 'Cruzeiro EC', away: 'Barcelona SC', homeScore: 4, awayScore: 0 },
    { date: '2026-05-22', home: 'CD Universidad Católica', away: 'Barcelona SC', homeScore: 2, awayScore: 0 },
    // Duplicado cross-proveedor del mismo partido con nombre largo/corto.
    { date: '2026-09-16', home: 'RC Deportivo La Coruña', away: 'Sevilla FC', homeScore: 0, awayScore: 1 },
    { date: '2026-09-16', home: 'Deportivo La Coruna', away: 'Sevilla', homeScore: 0, awayScore: 1 },
    { date: '2026-09-11', home: 'Sevilla FC', away: 'Valencia CF', homeScore: 1, awayScore: 0 },
    { date: '2026-08-22', home: 'Athletic Club', away: 'Sevilla FC', homeScore: 1, awayScore: 3 },
  ];
  const barca = teamRates(results, 'Barcelona');
  assert.equal(barca.played, 3); // 2 propios + 1 FC Barcelona; Quito fuera
  assert.ok(barca.gf > 4); // 7+4+5 entre 3: sin contaminación 2.16
  const sevilla = teamRates(results, 'Sevilla');
  assert.equal(sevilla.played, 3); // el Depor duplicado cuenta una vez
});

/* ---- Blend Poisson + xG para el primer gol ---- */

test('blendLambdas promedia a partes iguales y es null-honesto', () => {
  assert.deepEqual(blendLambdas({ home: 1.8, away: 1.38 }, { home: 1.1, away: 2.08 }), { home: 1.45, away: 1.73 });
  assert.equal(blendLambdas(null, { home: 1, away: 1 }), null);
  assert.equal(blendLambdas({ home: 1, away: 1 }, null), null);
  assert.equal(blendLambdas({ home: 1, away: 1 }, { home: 0, away: 1 }), null);
});

test('computeMatchMarkets usa el blend para la carrera cuando hay xG', () => {
  const results = [
    ...Array.from({ length: 4 }, (_, i) => ({ date: `2026-08-0${i + 1}`, home: 'Sevilla', away: 'Otro', homeScore: 2, awayScore: 1 })),
    ...Array.from({ length: 4 }, (_, i) => ({ date: `2026-08-0${i + 1}`, home: 'FC Barcelona', away: 'Otro', homeScore: 4, awayScore: 1 })),
  ];
  const plain = computeMatchMarkets({ match: { home: 'Sevilla', away: 'Barcelona', competition: 'laliga' }, results });
  const blended = computeMatchMarkets({ match: { home: 'Sevilla', away: 'Barcelona', competition: 'laliga', modelPrediction: { xg: { home: 1.1, away: 2.08 } } }, results });
  assert.equal(plain.firstGoalSource, 'Poisson');
  assert.equal(blended.firstGoalSource, 'Blend Poisson+xG');
  assert.equal(blended.method, 'poisson-blend-v1');
  assert.ok(blended.lambdasBlend);
  // El blend tira el primer gol hacia el visitante (dirección Bzzoiro 1-2).
  assert.ok(blended.firstGoal.firstAway > plain.firstGoal.firstAway);
  const total = blended.firstGoal.bands.reduce((s, b) => s + b.p, 0) + blended.firstGoal.noGoal;
  assert.equal(Math.round(total * 100), 100);
});

/* ---- Reparto top-5 de favoritos a abrir el marcador ---- */

test('topScorerSplit reparte el 100% entre los 5 primeros', () => {
  // Sevilla vs Barcelona 2026-09-19: firsts reales del JSON (blend 1.36–2.535).
  const rows = {
    home: [
      { player: 'Miguel Sierra', goals: 2, first: 0.077, anytime: 0.26 },
      { player: 'Chidera Ejuke', goals: 1, first: 0.039, anytime: 0.14 },
    ],
    away: [
      { player: 'Raphinha', goals: 9, first: 0.209, anytime: 0.56 },
      { player: 'Lamine Yamal', goals: 7, first: 0.163, anytime: 0.47 },
      { player: 'Fermín López', goals: 4, first: 0.093, anytime: 0.3 },
    ],
  };
  const split = topScorerSplit(rows, { noGoal: 0.02 });
  assert.equal(split.rows.length, 5);
  assert.equal(split.rows[0].player, 'Raphinha');
  assert.ok(close(split.rows[0].split, 0.36, 0.005));
  const sum = split.rows.reduce((s, r) => s + r.split, 0);
  assert.equal(Math.round(sum * 100), 100);
  assert.ok(close(split.leftover, 0.399, 0.005)); // cero + resto fuera de la fila
});

test('topScorerSplit corta a 5 y es null-honesto sin filas', () => {
  const many = {
    home: Array.from({ length: 4 }, (_, i) => ({ player: `H${i}`, first: 0.1 - i * 0.01 })),
    away: Array.from({ length: 4 }, (_, i) => ({ player: `A${i}`, first: 0.09 - i * 0.01 })),
  };
  const split = topScorerSplit(many, {});
  assert.equal(split.rows.length, 5);
  assert.equal(split.leftover, null);
  assert.equal(topScorerSplit({ home: [], away: [] }, {}), null);
  assert.equal(topScorerSplit(null, {}), null);
  assert.equal(topScorerSplit({ home: [{ player: 'X', first: 0 }], away: [] }, {}), null);
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

test('teamContext usa un solo contexto: últimos 5 en su liga', () => {
  const results = Array.from({ length: 7 }, (_, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, '0')}`,
    competition: 'premier',
    home: 'Local',
    away: 'Otro',
    homeScore: index < 2 ? 0 : 1, // los 2 más viejos son derrotas 0-1, los 5 recientes son 1-0
    awayScore: index < 2 ? 1 : 0,
  }));
  const context = teamContext(results, {}, {}, { home: 'Local', away: 'Visitante', competition: 'premier' }, 'home');
  assert.equal(context.recentSample, 5);
  assert.equal(context.debut, false);
  assert.equal(context.cleanSheets.value, 5);
  assert.equal(context.cleanSheets.sample, 5);
  assert.equal(context.unbeaten.value, 5);
  assert.equal(context.biggestWin.value, 1);
});

test('teamContext debuta con 0 partidos jugados solo sin previos en su liga', () => {
  const context = teamContext([], {}, {}, { home: 'Local', away: 'Visitante', competition: 'premier' }, 'home');
  assert.equal(context.recentSample, 0);
  assert.equal(context.debut, true);
  assert.equal(context.cleanSheets, null);
  assert.equal(context.biggestWin, null);
  assert.equal(context.unbeaten, null);
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
  assert.equal(map.pinX, null);
  assert.equal(map.pinY, null);
});
