import test from 'node:test';
import assert from 'node:assert/strict';
import { getFixtures, getStandings, getScorers, fuseScorers, mapProviderPrediction, fetchProviderPrediction } from '../src/lib/football.js';

/** Minimal provider stubs matching the real response shapes of each endpoint. */
const AF_FIXTURE = {
  fixture: { id: 1, date: '2026-09-15T18:00:00Z', status: { short: 'NS', elapsed: null }, venue: { name: 'Estadio Uno' } },
  league: { id: 140, round: 'Regular Season - 5' },
  teams: { home: { name: 'Casa' }, away: { name: 'Visita' } },
  goals: { home: null, away: null },
  score: { halftime: { home: null, away: null } },
};
const FD_MATCH = {
  id: 2, utcDate: '2026-09-16T18:00:00Z', status: 'SCHEDULED', matchday: 5, stage: 'REGULAR_SEASON',
  competition: { code: 'PD' }, homeTeam: { name: 'Casa' }, awayTeam: { name: 'Visita' },
  score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
};

test('fixtures carry the cost-free fields: halfTime, round, venue, stage', async () => {
  const { getFixtures } = await import('../src/lib/football.js');
  const result = await getFixtures({
    date: '2026-09-15', days: 3, now: '2026-09-15',
    env: { API_FOOTBALL_KEY: 'af', FOOTBALL_DATA_KEY: 'fd' },
    fetchImpl: async url => {
      if (url.includes('api-sports')) return new Response(JSON.stringify({ response: [AF_FIXTURE] }), { status: 200 });
      if (url.includes('football-data')) return new Response(JSON.stringify({ matches: [FD_MATCH] }), { status: 200 });
      return new Response('', { status: 404 });
    },
    paceMs: 0,
  });
  const [af] = result.matches.filter(match => match.id === 'af-1');
  assert.equal(af.round, 'Regular Season - 5');
  assert.equal(af.venue, 'Estadio Uno');
  assert.equal(af.halfTime, null); // pre-match: honest null, never zeros
  const fd = result.matches.find(match => match.id === 'fd-2');
  assert.equal(fd.round, 5);
  assert.equal(fd.stage, 'REGULAR_SEASON');
  assert.equal(fd.halfTime, null);
});

test('getStandings returns the TOTAL table with form translated to G/E/P', async () => {
  const standings = await getStandings({
    competition: { id: 'laliga', fd: 'PD' }, season: 2026, top: 2,
    env: { FOOTBALL_DATA_KEY: 'fd' },
    fetchImpl: async () => new Response(JSON.stringify({
      season: { startDate: '2026-07-01' },
      standings: [{ stage: 'TOTAL', type: 'TOTAL', table: [
        { position: 1, team: { name: 'Líder FC' }, playedGames: 4, won: 4, draw: 0, lost: 0, goalsFor: 10, goalsAgainst: 2, goalDifference: 8, points: 12, form: ['W', 'W', 'D', 'W'] },
        { position: 2, team: { name: 'Segundo FC' }, playedGames: 4, won: 2, draw: 1, lost: 1, goalsFor: 6, goalsAgainst: 5, goalDifference: 1, points: 7 },
      ] }],
    }), { status: 200 }),
    paceMs: 0,
  });
  assert.equal(standings.season, '2026');
  assert.equal(standings.provider, 'Football-Data.org');
  assert.equal(standings.rows.length, 2);
  assert.equal(standings.rows[0].points, 12);
  assert.deepEqual(standings.rows[0].form, ['G', 'G', 'E', 'G']);
  assert.equal(standings.rows[1].form, null); // absent form stays null
});

test('getStandings stores the full table by default; the client slices the top 10', async () => {
  const standings = await getStandings({
    competition: { id: 'laliga', fd: 'PD' }, season: 2026,
    env: { FOOTBALL_DATA_KEY: 'fd' },
    fetchImpl: async () => new Response(JSON.stringify({
      season: { startDate: '2026-07-01' },
      standings: [{ stage: 'TOTAL', type: 'TOTAL', table: Array.from({ length: 22 }, (_, i) => (
        { position: i + 1, team: { name: `Equipo ${i + 1}` }, playedGames: 4, won: 1, draw: 1, lost: 2, goalsFor: 5, goalsAgainst: 6, goalDifference: -1, points: 4 }
      )) }],
    }), { status: 200 }),
    paceMs: 0,
  });
  assert.equal(standings.rows.length, 20);
});

test('getScorers maps the football-data top with assists, penalties and matches', async () => {
  const rows = await getScorers({
    competition: { id: 'laliga', fd: 'PD' }, season: 2026,
    env: { FOOTBALL_DATA_KEY: 'fd' },
    fetchImpl: async () => new Response(JSON.stringify({ scorers: [
      { player: { name: 'Kylian Mbappé' }, team: { name: 'Real Madrid' }, playedMatches: 8, goals: 9, assists: 2, penalties: 3 },
    ] }), { status: 200 }),
    paceMs: 0,
  });
  assert.deepEqual(rows, [{ player: 'Kylian Mbappé', team: 'Real Madrid', goals: 9, assists: 2, penalties: 3, playedMatches: 8 }]);
  assert.deepEqual(await getScorers({ competition: { id: 'europa', fd: null }, season: 2026, env: { FOOTBALL_DATA_KEY: 'fd' }, paceMs: 0 }), []);
});

test('fuseScorers lets football-data lead on goals while Bzzoiro keeps the ids', () => {
  const bzzoiro = [
    { rank: 1, player: 'Kylian Mbappe', playerId: 7, team: 'Real Madrid', teamId: 86, value: 8, matches: 7 },
    { rank: 2, player: 'Solo Bzzoiro', playerId: 9, team: 'Casa', teamId: 1, value: 5, matches: 7 },
  ];
  const fd = [
    { player: 'Kylian Mbappé', team: 'Real Madrid', goals: 9, assists: 2, penalties: 3, playedMatches: 8 },
    { player: 'Solo FD', team: 'Visita', goals: 4, assists: 1, penalties: 0, playedMatches: 8 },
  ];
  const fused = fuseScorers(bzzoiro, fd);
  assert.equal(fused[0].value, 9); // FD manda en goles (tildes incluidas en el emparejado)
  assert.equal(fused[0].playerId, 7); // Bzzoiro conserva el id
  assert.equal(fused[0].assists, 2);
  assert.equal(fused[0].matches, 8);
  assert.equal(fused[1].player, 'Solo Bzzoiro'); // sin pareja: fila intacta
  const extra = fused.find(row => row.player === 'Solo FD');
  assert.equal(extra.value, 4);
  assert.equal(extra.playerId, null); // nunca se inventan ids
  assert.deepEqual(fuseScorers(bzzoiro, []), bzzoiro);
});

test('mapProviderPrediction mapea la lectura de API-Football y descarta lo irreconocible', () => {
  const mapped = mapProviderPrediction({ response: [{ predictions: {
    winner: { id: 49, name: 'Chelsea', comment: 'Win or draw' },
    win_or_draw: true, under_over: null,
    goals: { home: '-3.5', away: '-2.5' },
    advice: 'Double chance : draw or Chelsea',
    percent: { home: '10%', draw: '45%', away: '45%' },
  } }] });
  assert.equal(mapped.winner, 'Chelsea');
  assert.equal(mapped.winOrDraw, true);
  assert.deepEqual(mapped.percent, { home: 0.1, draw: 0.45, away: 0.45 });
  assert.equal(mapped.advice, 'Double chance : draw or Chelsea');
  assert.equal(mapped.source, 'API-Football');
  assert.equal(mapProviderPrediction({ response: [] }), null);
  assert.equal(mapProviderPrediction({ response: [{ predictions: {} }] }), null);
  assert.equal(mapProviderPrediction(null), null);
});

test('fetchProviderPrediction gasta una llamada y degrada a null sin clave, sin id o con error', async () => {
  let calls = 0;
  const mapped = await fetchProviderPrediction(1557408, {
    env: { API_FOOTBALL_KEY: 'af' }, paceMs: 0,
    fetchImpl: async url => {
      calls += 1;
      assert.ok(url.includes('/predictions?fixture=1557408'));
      return new Response(JSON.stringify({ response: [{ predictions: { winner: { name: 'Chelsea' }, percent: { home: '10%', draw: '45%', away: '45%' } } }] }), { status: 200 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(mapped.winner, 'Chelsea');
  assert.equal(await fetchProviderPrediction(1557408, { env: {}, paceMs: 0 }), null);
  assert.equal(await fetchProviderPrediction(null, { env: { API_FOOTBALL_KEY: 'af' }, paceMs: 0 }), null);
  assert.equal(await fetchProviderPrediction(1557408, { env: { API_FOOTBALL_KEY: 'af' }, paceMs: 0, fetchImpl: async () => new Response('', { status: 429 }) }), null);
});
