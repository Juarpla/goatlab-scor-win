import test from 'node:test';
import assert from 'node:assert/strict';
import { topFreshness } from '../src/lib/top.js';

const now = Date.parse('2026-10-08T22:00:00Z');
const top = (ageHours = 1) => ({ version: 1, generatedAt: new Date(now - ageHours * 3_600_000).toISOString(), ranking: [{ id: 'home-vs-away-date' }], extra: ['af-1'] });

test('top freshness shares a seven-hour default and exact boundary', () => {
  assert.deepEqual(topFreshness(top(7), { now }), { valid: true, reason: 'fresh', ageHours: 7, stale: false });
  assert.deepEqual(topFreshness(top(7 + 1 / 3_600_000), { now }), { valid: false, reason: 'stale', ageHours: 7 + 1 / 3_600_000, stale: true });
  assert.equal(topFreshness(top(0), { now }).valid, true);
});

test('zero maximum age is accepted and invalid configuration uses the default', () => {
  assert.equal(topFreshness(top(0), { now, env: { TOP_MAX_AGE_HOURS: '0' } }).valid, true);
  assert.equal(topFreshness(top(1 / 3_600_000), { now, env: { TOP_MAX_AGE_HOURS: 0 } }).reason, 'stale');
  assert.equal(topFreshness(top(6), { now, env: { TOP_MAX_AGE_HOURS: '2' } }).reason, 'stale');
  for (const raw of ['', 'bad', '-1', Infinity, undefined]) {
    assert.equal(topFreshness(top(6), { now, env: { TOP_MAX_AGE_HOURS: raw } }).valid, true);
  }
});

test('empty rankings and optional extras remain valid authoritative selections', () => {
  const empty = { version: 1, generatedAt: new Date(now).toISOString(), ranking: [] };
  assert.equal(topFreshness(empty, { now }).valid, true);
  assert.equal(topFreshness({ ...empty, extra: [] }, { now }).valid, true);
});

test('missing, corrupt, unsafe and future top data cannot use manual age bypass', () => {
  assert.equal(topFreshness(null, { now, manual: true }).reason, 'missing');
  for (const value of [[], '{broken', {}, { ...top(), version: 2 }, { ...top(), ranking: ['id'] }, { ...top(), ranking: [{ id: '../escape' }] }, { ...top(), ranking: [{ id: 1 }] }, { ...top(), extra: null }, { ...top(), extra: ['../escape'] }, { ...top(), generatedAt: 'unknown' }, { ...top(), generatedAt: '2026-10-08' }]) {
    assert.equal(topFreshness(value, { now, manual: true }).valid, false);
    assert.equal(topFreshness(value, { now, manual: true }).reason, 'invalid');
  }
  assert.deepEqual(topFreshness(top(-1), { now, manual: true }), { valid: false, reason: 'future', ageHours: -1, stale: false });
});

test('manual bypass applies exclusively to an otherwise valid old top', () => {
  assert.deepEqual(topFreshness(top(9), { now, manual: true }), { valid: true, reason: 'manual-age-bypass', ageHours: 9, stale: true });
  assert.equal(topFreshness(top(9), { now, manual: false }).valid, false);
  assert.equal(topFreshness(top(9), { now: NaN, manual: true }).valid, false);
});
