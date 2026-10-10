import test from 'node:test';
import assert from 'node:assert/strict';
import { getFixtures, staysOnWall } from '../src/lib/football.js';
import { mergeCalendarWindow } from '../scripts/update-data.mjs';

const now = Date.parse('2026-10-10T12:42:05.979Z');
const options = { date: '2026-10-10', now, logger: { warn() {} } };
const previous = [
  ['fd-564698', 'Rayo Vallecano de Madrid', 'Athletic Club', '12:00', 0, 0],
  ['fd-564699', 'Deportivo Alavés', 'Club Atlético de Madrid', '14:15'],
  ['fd-564700', 'FC Barcelona', 'Getafe CF', '16:30'],
  ['fd-564702', 'Real Madrid CF', 'Villarreal CF', '19:00'],
].map(([id, home, away, time, homeScore = null, awayScore = null]) => ({
  id, home, away, kickoff: `2026-10-10T${time}:00Z`, status: 'NS', homeScore, awayScore,
}));

test('empty successful fallback cannot erase the four known fixtures at 07:42 Lima', async () => {
  const warnings = [];
  const result = await getFixtures({ date: options.date, now: options.date, paceMs: 0,
    env: { FOOTBALL_DATA_KEY: 'test' }, fetchImpl: async () => Response.json({ matches: [] }) });
  const merged = mergeCalendarWindow(previous, result.matches, {
    ...options, logger: { warn(message) { warnings.push(message); } },
  });
  assert.deepEqual(merged.filter(m => staysOnWall(m, now)), previous);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /4/);
});

test('partial responses update tolerant twins without duplicating or removing missing matches', () => {
  const fresh = { ...previous[3], id: 'af-99', home: 'Real Madrid', away: 'Villarreal',
    status: '1H', homeScore: 1, awayScore: 0 };
  const merged = mergeCalendarWindow(previous, [fresh], options);
  assert.equal(merged.length, 4);
  assert.equal(merged.some(m => m.id === 'fd-564702'), false);
  assert.deepEqual(merged.find(m => m.id === 'af-99'), fresh);
  assert.equal(merged.includes(previous[0]), true);
});

test('retention respects seven-day boundaries and the existing score/expiry policy', () => {
  const scored = { ...previous[0], kickoff: '2026-10-10T08:00:00Z' };
  const stale = { ...previous[1], kickoff: '2026-10-10T08:00:00Z' };
  const past = { ...previous[2], kickoff: '2026-10-09T16:30:00Z' };
  const last = { ...previous[3], kickoff: '2026-10-16T19:00:00Z' };
  const outside = { ...previous[3], kickoff: '2026-10-17T19:00:00Z' };
  const merged = mergeCalendarWindow([scored, stale, past, last, outside], [], options);
  assert.deepEqual(merged, [scored, stale, last]);
  assert.deepEqual(merged.filter(m => staysOnWall(m, now)), [scored, last]);
});

test('provider outages preserve known matches and initial empty windows remain empty', async () => {
  const result = await getFixtures({ date: options.date, now: options.date, paceMs: 0,
    env: { FOOTBALL_DATA_KEY: 'test' }, logger: options.logger,
    fetchImpl: async () => new Response('', { status: 503 }) });
  assert.equal(result.unavailable, true);
  assert.deepEqual(mergeCalendarWindow(previous, result.matches, options), previous);
  assert.deepEqual(mergeCalendarWindow([], [], options), []);
});
