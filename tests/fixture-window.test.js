import test from 'node:test';
import assert from 'node:assert/strict';
import { getFixtures } from '../src/lib/football.js';

const match = (id, utcDate) => ({ id, utcDate, competition: { code: 'PD' },
  homeTeam: { name: 'Real Madrid CF' }, awayTeam: { name: 'Villarreal CF' },
  status: 'TIMED', score: { fullTime: { home: null, away: null } } });

test('single-day fallback retrieves Real Madrid–Villarreal when API-Football is suspended', async () => {
  const result = await getFixtures({ date: '2026-10-10', now: '2026-10-10', paceMs: 0,
    env: { API_FOOTBALL_KEY: 'test', FOOTBALL_DATA_KEY: 'test' }, logger: { warn() {} },
    fetchImpl: async url => {
      if (url.includes('api-sports')) return Response.json({ errors: { access: 'Account suspended' }, response: [] });
      const params = new URL(url).searchParams;
      const matches = params.get('dateTo') > params.get('dateFrom')
        ? [match(564702, '2026-10-10T19:00:00Z'), match(564703, '2026-10-11T12:00:00Z')] : [];
      return Response.json({ matches });
    } });
  assert.deepEqual(result.matches.map(m => m.id), ['fd-564702']);
  assert.equal(result.provider, 'Football-Data.org');
  assert.equal(result.delayed, true);
});

test('seven-day fallback includes the final day and excludes out-of-window responses', async () => {
  const dates = ['2026-10-09', '2026-10-10', '2026-10-16', '2026-10-17'];
  const result = await getFixtures({ date: '2026-10-10', days: 7, now: '2026-10-10', paceMs: 0,
    env: { FOOTBALL_DATA_KEY: 'test' }, fetchImpl: async url => {
      const params = new URL(url).searchParams;
      assert.equal(params.get('dateFrom'), '2026-10-10');
      assert.equal(params.get('dateTo'), '2026-10-17');
      return Response.json({ matches: dates.map((date, i) => match(i, `${date}T19:00:00Z`)) });
    } });
  assert.deepEqual(result.matches.map(m => m.kickoff.slice(0, 10)), ['2026-10-10', '2026-10-16']);
});
