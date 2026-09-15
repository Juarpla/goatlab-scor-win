import test from 'node:test';
import assert from 'node:assert/strict';
import { getFixtures, getLeagueResults, mergeFixtures } from '../src/lib/football.js';
const logger = { warn() {} };

test('fallback is explicitly delayed and does not invent detailed metrics', async () => {
  const data = await getFixtures({ date: '2026-09-13', logger, env: { API_FOOTBALL_KEY: 'a', FOOTBALL_DATA_KEY: 'b' }, fetchImpl: async url => url.includes('api-sports')
    ? new Response('', { status: 429 })
    : new Response(JSON.stringify({ matches: [{ id: 1, competition: { code: 'PL' }, homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, utcDate: '2026-09-13T15:00:00Z', status: 'IN_PLAY', score: { fullTime: { home: 1, away: 0 } } }] })) });
  assert.equal(data.provider, 'Football-Data.org');
  assert.equal(data.delayed, true); assert.equal(data.matches[0].events, null); assert.equal(data.matches[0].id, 'fd-1');
});
test('valid empty API-Football schedule is authoritative and spends no fallback request', async () => {
  let fdCalls = 0;
  const result = await getFixtures({ date: '2026-09-13', env: { API_FOOTBALL_KEY: 'a', FOOTBALL_DATA_KEY: 'b' }, fetchImpl: async url => {
    if (url.includes('api-sports')) return new Response('{"response":[]}');
    fdCalls++;
    return new Response('{"matches":[]}');
  }, paceMs: 0 });
  assert.equal(fdCalls, 0); assert.deepEqual(result.matches, []); assert.equal(result.unavailable, undefined);
  assert.equal(result.provider, 'API-Football');
});
test('a 7-day window is one football-data request; API-Football only overlays today..tomorrow', async () => {
  const calls = [];
  const result = await getFixtures({ date: '2026-09-14', days: 7, env: { API_FOOTBALL_KEY: 'a', FOOTBALL_DATA_KEY: 'b' }, fetchImpl: async url => {
    calls.push(url);
    if (url.includes('api-sports')) return new Response('{"response":[]}');
    return new Response('{"matches":[]}');
  }, paceMs: 0 });
  const afCalls = calls.filter(url => url.includes('api-sports'));
  const fdCalls = calls.filter(url => url.includes('football-data'));
  assert.equal(fdCalls.length, 1);
  assert.equal(new URL(fdCalls[0]).searchParams.get('dateFrom'), '2026-09-16'); // only the dates API-Football cannot serve
  assert.equal(new URL(fdCalls[0]).searchParams.get('dateTo'), '2026-09-20');
  assert.equal(afCalls.length, 2); // today and tomorrow — the free plan rejects the rest
  assert.ok(afCalls.every(url => ['2026-09-14', '2026-09-15'].includes(new URL(url).searchParams.get('date'))));
  assert.equal(result.provider, 'API-Football + Football-Data.org');
  assert.equal(result.delayed, false);
});
test('mergeFixtures replaces twins and yields the window to the primary provider', () => {
  const previous = [
    { id: 'fd-1', home: 'Leeds United FC', away: 'Newcastle United FC', kickoff: '2026-09-14T19:00:00Z', status: 'NS' },
    { id: 'fd-2', home: 'Villarreal', away: 'Real Betis', kickoff: '2026-09-14T19:00:00Z', status: 'NS' },
    { id: 'fd-3', home: 'Getafe', away: 'Sevilla', kickoff: '2026-09-18T19:00:00Z', status: 'NS' },
  ];
  const fresh = [
    { id: 'af-9', home: 'Leeds', away: 'Newcastle', kickoff: '2026-09-14T19:00:00Z', status: '1H', minute: 23 },
    { id: 'af-10', home: 'Real Betis', away: 'Villarreal', kickoff: '2026-09-14T19:00:00Z', status: 'NS' },
  ];
  const merged = mergeFixtures(previous, fresh, ['2026-09-14']);
  // 09-14 is ruled by the fresh provider: fd-1 and fd-2 are gone even without twins...
  assert.ok(!merged.some(match => match.id.startsWith('fd-1') || match.id.startsWith('fd-2')));
  // ...but fd-3 (outside the replaced date) survives, and the reversed fixture is appended, not merged.
  assert.ok(merged.some(match => match.id === 'fd-3'));
  assert.ok(merged.some(match => match.id === 'af-10' && match.home === 'Real Betis'));
  assert.equal(merged.find(match => match.id === 'af-9').status, '1H');
});
test('missing credentials is an unavailable state, never fabricated fixtures', async () => {
  const result = await getFixtures({ date: '2026-09-13', logger });
  assert.equal(result.unavailable, true); assert.equal(result.updatedAt, null);
});
test('league results come from football-data, finished matches only', async () => {
  const rows = await getLeagueResults({ competition: { id: 'premier', api: 39, fd: 'PL' }, season: 2026, env: { FOOTBALL_DATA_KEY: 'b' }, fetchImpl: async () => new Response(JSON.stringify({ matches: [
    { id: 10, utcDate: '2026-09-10T14:00:00Z', status: 'FINISHED', competition: { code: 'PL' }, homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Newcastle United' }, score: { fullTime: { home: 2, away: 1 } } },
    { id: 11, utcDate: '2026-09-11T14:00:00Z', status: 'SCHEDULED', competition: { code: 'PL' }, homeTeam: { name: 'C' }, awayTeam: { name: 'D' }, score: { fullTime: { home: null, away: null } } },
    { id: 12, utcDate: '2026-09-12T14:00:00Z', status: 'FINISHED', competition: { code: 'CL' }, homeTeam: { name: 'E' }, awayTeam: { name: 'F' }, score: { fullTime: { home: 1, away: 1 } } },
  ] })), paceMs: 0 });
  assert.deepEqual(rows, [{ id: 'fd-10', date: '2026-09-10', competition: 'premier', home: 'Arsenal', away: 'Newcastle United', homeScore: 2, awayScore: 1 }]);
});
test('fallback statuses are normalized to the API-Football vocabulary', async () => {
  const data = await getFixtures({ date: '2026-09-13', logger, env: { FOOTBALL_DATA_KEY: 'b' }, fetchImpl: async () => new Response(JSON.stringify({ matches: [
    { id: 7, competition: { code: 'PL' }, homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, utcDate: '2026-09-13T15:00:00Z', status: 'FINISHED', score: { fullTime: { home: 1, away: 0 } } },
    { id: 8, competition: { code: 'PL' }, homeTeam: { name: 'C' }, awayTeam: { name: 'D' }, utcDate: '2026-09-13T17:00:00Z', status: 'IN_PLAY', score: { fullTime: { home: null, away: null } } },
  ] })) });
  assert.equal(data.matches[0].status, 'FT');
  assert.equal(data.matches[1].status, 'LIVE');
});
