import test from 'node:test';
import assert from 'node:assert/strict';
import { sameTeam, enrichMatches } from '../src/lib/bzzoiro.js';

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
