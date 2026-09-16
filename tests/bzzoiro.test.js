import test from 'node:test';
import assert from 'node:assert/strict';
import { sameTeam, enrichMatches, mapBzzoiroStandings, mapLeaderboard, mapEventDetail } from '../src/lib/bzzoiro.js';

test('sameTeam matches full names, accents and abbreviations', () => {
  assert.equal(sameTeam('Manchester City', 'Man City'), true);
  assert.equal(sameTeam('Paris Saint Germain', 'Paris Saint-Germain'), true);
  assert.equal(sameTeam('Manchester United', 'Man Utd'), true);
  assert.equal(sameTeam('Atlético Madrid', 'Atletico Madrid'), true);
  assert.equal(sameTeam('Liverpool FC', 'Liverpool'), true);
  assert.equal(sameTeam('Manchester United', 'Manchester City'), false);
  assert.equal(sameTeam('Arsenal', 'Chelsea'), false);
  assert.equal(sameTeam('', 'Arsenal'), false);
});

test('enrichMatches pairs fixtures by team names and normalizes stats/incidents', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.includes('/events/?')) {
      return new Response(JSON.stringify({ results: [
        { id: 9001, home_team: 'Leeds United', away_team: 'Newcastle United' },
        { id: 9002, home_team: 'Villarreal', away_team: 'Real Betis' },
      ] }), { status: 200 });
    }
    if (url.includes('/9001/stats/')) {
      return new Response(JSON.stringify({ event_id: 9001, xg_estimated: true, stats: { home: { ball_possession: 55, total_shots: 13, shots_on_target: 5, corner_kicks: 6, fouls: 9, yellow_cards: 2, red_cards: 0, offsides: 1, xg: { actual: 1.62 } }, away: { ball_possession: 45, total_shots: 9, shots_on_target: 3, corner_kicks: 4, fouls: 11, yellow_cards: 3, red_cards: null, offsides: 0, xg: { actual: 0.71 } } } }), { status: 200 });
    }
    if (url.includes('/9001/incidents/')) {
      return new Response(JSON.stringify({ incidents: [
        { type: 'period', text: 'FT', minute: 90 },
        { type: 'card', minute: 90, player: 'F. Chaverra', is_home: false, card_type: 'yellow' },
        { type: 'substitution', minute: 86, is_home: true, player_in: 'D. Pérez', player_out: 'D. Calcaterra' },
        { type: 'goal', minute: 84, player: 'R. Contreras', is_home: false, home_score: 1, away_score: 2 },
      ] }), { status: 200 });
    }
    return new Response('', { status: 404 });
  };
  const enrichments = await enrichMatches(
    [{ id: 'af-1', home: 'Leeds', away: 'Newcastle', kickoff: '2026-09-14T19:00:00Z' }, { id: 'af-2', home: 'Villarreal', away: 'Real Betis', kickoff: '2026-09-14T19:00:00Z' }],
    { date: '2026-09-14', env: { BZZOIRO_API_TOKEN: 't' }, fetchImpl, logger: { warn() {} } },
  );
  assert.equal(calls.filter(url => url.includes('/stats/') || url.includes('/incidents/')).length, 4); // both matched fixtures attempted; the 9002 pair 404s
  const stats = enrichments['af-1'].statistics;
  assert.equal(stats.home.possession, 55);
  assert.equal(stats.home.xg, 1.62);
  assert.equal(stats.away.redCards, null); // null means unknown, never 0
  assert.equal(stats.source, 'Bzzoiro');
  const events = enrichments['af-1'].events;
  assert.deepEqual(events.map(event => event.type), ['goal', 'sub', 'card']); // oldest first, period rows dropped
  assert.deepEqual(events.map(event => event.minute), [84, 86, 90]);
  assert.equal(events[0].team, 'away');
  assert.deepEqual(events[0].score, { home: 1, away: 2 });
  assert.equal(enrichments['af-2'], undefined); // no stats/incidents endpoints hit for it
});

test('enrichMatches is a no-op without token or matches, and survives provider errors', async () => {
  assert.deepEqual(await enrichMatches([{ id: 'a', home: 'A', away: 'B' }], { date: '2026-09-14', env: {}, fetchImpl: async () => { throw new Error('no'); } }), {});
  assert.deepEqual(await enrichMatches([], { date: '2026-09-14', env: { BZZOIRO_API_TOKEN: 't' }, fetchImpl: async () => { throw new Error('no'); } }), {});
  const failing = await enrichMatches([{ id: 'a', home: 'A', away: 'B' }], { date: '2026-09-14', env: { BZZOIRO_API_TOKEN: 't' }, fetchImpl: async () => new Response('', { status: 500 }), logger: { warn() {} } });
  assert.deepEqual(failing, {});
});
test('all-null pre-match stats collapse to no statistics', async () => {
  const fetchImpl = async url => url.includes('/events/?')
    ? new Response(JSON.stringify({ results: [{ id: 5, home_team: 'Leeds United', away_team: 'Newcastle United' }] }), { status: 200 })
    : url.includes('/5/stats/')
      ? new Response(JSON.stringify({ event_id: 5, stats: { home: { ball_possession: null, total_shots: null, shots_on_target: null, corner_kicks: null, fouls: null, yellow_cards: null, red_cards: null, offsides: null, xg: { actual: null } }, away: { ball_possession: null, total_shots: null, shots_on_target: null, corner_kicks: null, fouls: null, yellow_cards: null, red_cards: null, offsides: null, xg: { actual: null } } } }), { status: 200 })
      : new Response(JSON.stringify({ incidents: [] }), { status: 200 });
  const enrichments = await enrichMatches([{ id: 'af-1', home: 'Leeds', away: 'Newcastle', kickoff: '2026-09-14T19:00:00Z' }], { date: '2026-09-14', env: { BZZOIRO_API_TOKEN: 't' }, fetchImpl });
  assert.equal(enrichments['af-1'].statistics, null);
});

test('mapBzzoiroStandings keeps won/drawn/lost, goals and zone, full table by default', () => {
  const table = { standings: Array.from({ length: 22 }, (_, i) => ({
    position: i + 1, team_name: `Equipo ${i + 1}`, team_id: 100 + i,
    played: 4, won: 3, drawn: 1, lost: 0, goals_for: 9, goals_against: 2, pts: 10,
    zone: i === 0 ? 'champions' : null, form: ['W', 'W'],
  })) };
  const rows = mapBzzoiroStandings(table);
  assert.equal(rows.length, 20); // tabla completa, el top-10 queda en el cliente
  assert.equal(rows[0].won, 3);
  assert.equal(rows[0].drawn, 1);
  assert.equal(rows[0].goalsFor, 9);
  assert.equal(rows[0].goalsAgainst, 2);
  assert.equal(rows[0].goalDifference, 7);
  assert.equal(rows[0].zone, 'champions');
  assert.equal(rows[1].zone, null);
});

test('mapBzzoiroStandings flattens cup groups instead of dropping them', () => {
  const rows = mapBzzoiroStandings({ groups: [
    { group: 'A', standings: [{ position: 1, team_name: 'Líder', team_id: 1, played: 2, won: 2, pts: 6 }] },
    { group: 'B', rows: [{ position: 1, team_name: 'Otro', team_id: 2, played: 2, drawn: 2, pts: 2 }] },
  ] });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].team, 'Líder');
  assert.equal(mapBzzoiroStandings({ standings: [] }), null);
});

test('mapLeaderboard keeps the player position', () => {
  const rows = mapLeaderboard({ leaders: [{ rank: 1, player_name: 'Goleador', player_id: 7, position: 'Forward', team_name: 'Casa', team_id: 3, value: 9, matches: 8 }] });
  assert.equal(rows[0].position, 'Forward');
  assert.equal(rows[0].playerId, 7);
});

test('mapEventDetail captures weather, pitch, attendance, referee and venue', () => {
  const detail = mapEventDetail({
    referee: 'Soto Grado', venue: 'Mestalla', venue_city: 'Valencia', attendance: 45000,
    pitch: 'good', weather: { temp: 21, condition: 'Clear', wind: 12, humidity: 60 },
    is_derby: false, is_neutral: false, has_xg: true, round_name: 'Jornada 5',
    kickoff_time: '2026-09-14T19:00:00Z',
  });
  assert.equal(detail.referee, 'Soto Grado');
  assert.equal(detail.venue, 'Mestalla');
  assert.equal(detail.attendance, 45000);
  assert.equal(detail.weather.temp, 21);
  assert.equal(detail.weather.condition, 'Clear');
  assert.equal(detail.round, 'Jornada 5');
  const stringWeather = mapEventDetail({ weather: 'Rain', kickoff_time: '2026-09-14T19:00:00Z' });
  assert.equal(stringWeather.weather.condition, 'Rain');
  assert.equal(mapEventDetail({}), null);
  assert.equal(mapEventDetail(null), null);
});
