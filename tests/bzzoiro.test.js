import test from 'node:test';
import assert from 'node:assert/strict';
import { sameTeam, enrichMatches, mapBzzoiroStandings, mapLeaderboard, mapEventDetail, mapH2H, hasH2HHistory, mapTeamLast, fetchTeamLast, mapPrediction } from '../src/lib/bzzoiro.js';

test('mapPrediction conserva los picks del modelo (recommendations) sin inventar lo ausente', () => {
  const mapped = mapPrediction({
    markets: { match_result: { prob_home: 42, prob_draw: 28, prob_away: 30, predicted: 'home' }, over_under: { prob_over_25: 46 }, btts: { prob_yes: 51 } },
    recommendations: { favorite: 'away', favorite_prob: 35.7, over_25: false, btts: true },
    model: { confidence: 0.62, version: 'v1' },
  });
  assert.deepEqual(mapped.recommendations, { favorite: 'away', favoriteProb: 0.357, over25: false, btts: true });
  assert.equal(mapped.oneX2.home, 0.42);
  const without = mapPrediction({ markets: { match_result: { prob_home: 42, prob_draw: 28, prob_away: 30 } } });
  assert.equal(without.recommendations, null);
});

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

test('mapBzzoiroStandings flattens object-form groups (Libertadores)', () => {
  const rows = mapBzzoiroStandings({ groups: {
    'Group A': [{ position: 1, team_name: 'Flamengo', team_id: 160, played: 6, won: 5, pts: 15 }],
    'Group B': [{ position: 1, team_name: 'Palmeiras', team_id: 161, played: 6, won: 4, pts: 13 }],
  } });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].teamId, 160);
  assert.equal(rows[1].team, 'Palmeiras');
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

test('mapH2H distinguishes confirmed zero meetings from missing data', () => {
  const zero = mapH2H({ total_matches: 0 });
  assert.equal(zero.totalMatches, 0);
  assert.deepEqual(zero.recent, []);
  assert.equal(zero.source, 'Bzzoiro');
  assert.equal(mapH2H({}), null);
  assert.equal(mapH2H(null), null);
  const some = mapH2H({ total_matches: 2, home_wins: 0, draws: 0, away_wins: 2, recent_matches: [] });
  assert.equal(some.totalMatches, 2);
});

test('hasH2HHistory gates the head-to-head display at three recorded meetings', () => {
  assert.equal(hasH2HHistory({ totalMatches: 3, recent: [] }), true);
  assert.equal(hasH2HHistory({ totalMatches: 12, recent: [] }), true);
  assert.equal(hasH2HHistory({ totalMatches: 2, recent: [] }), false);
  assert.equal(hasH2HHistory({ totalMatches: 0, recent: [] }), false);
  assert.equal(hasH2HHistory(null), false);
  assert.equal(hasH2HHistory({}), false);
  assert.equal(hasH2HHistory({ totalMatches: 3 }, 4), false);
});

test('mapTeamLast keeps finished matches strictly before the fixture, newest first', () => {
  const rows = [
    { id: 3, status: 'finished', event_date: '2026-09-13T18:45:00+00:00', home_team: 'Sassuolo', away_team: 'Juventus', home_team_id: 61, away_team_id: 73, home_score: 3, away_score: 2 },
    { id: 2, status: 'finished', event_date: '2026-09-13T19:00:00+00:00', home_team: 'Otro', away_team: 'Rival', home_team_id: 1, away_team_id: 2, home_score: null, away_score: null },
    { id: 1, status: 'finished', event_date: '2026-09-20T18:45:00+00:00', home_team: 'Juventus', away_team: 'Inter', home_team_id: 73, away_team_id: 60, home_score: 1, away_score: 1 },
    { id: 0, status: 'scheduled', event_date: '2026-09-10T18:45:00+00:00', home_team: 'Juventus', away_team: 'Milan', home_team_id: 73, away_team_id: 59, home_score: 2, away_score: 0 },
  ];
  const last = mapTeamLast(rows, { before: '2026-09-17T19:00:00+00:00', limit: 5 });
  assert.equal(last.length, 1); // scoreless, future and scheduled rows are out
  assert.deepEqual(last[0], {
    eventId: 3, date: '2026-09-13T18:45:00+00:00', home: 'Sassuolo', away: 'Juventus',
    homeTeamId: 61, awayTeamId: 73, homeScore: 3, awayScore: 2,
  });
  assert.deepEqual(mapTeamLast(rows, { before: '2026-09-01T00:00:00+00:00' }), []);
  assert.deepEqual(mapTeamLast(null), []);
});

test('fetchTeamLast queries finished events by team and maps them', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    return new Response(JSON.stringify({ results: [
      { id: 3, status: 'finished', event_date: '2026-09-13T18:45:00+00:00', home_team: 'Sassuolo', away_team: 'Juventus', home_team_id: 61, away_team_id: 73, home_score: 3, away_score: 2 },
    ] }), { status: 200 });
  };
  const last = await fetchTeamLast(73, { before: '2026-09-17T19:00:00+00:00', env: { BZZOIRO_API_TOKEN: 't' }, fetchImpl });
  assert.ok(calls[0].includes('team_id=73') && calls[0].includes('status=finished'));
  assert.equal(last.length, 1);
  assert.equal(last[0].away, 'Juventus');
  assert.equal(await fetchTeamLast(null, { env: { BZZOIRO_API_TOKEN: 't' }, fetchImpl }), null);
  assert.equal(await fetchTeamLast(73, { env: {}, fetchImpl }), null);
});
