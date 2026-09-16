import test from 'node:test';
import assert from 'node:assert/strict';
import { getFixtures, getStandings } from '../src/lib/football.js';

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
