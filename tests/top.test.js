import test from 'node:test';
import assert from 'node:assert/strict';
import { TOP_FILENAME, TOP_VERSION, defaultTopN, effectiveIds, liveIds, rankingIds, registerExtra, pruneExtra } from '../src/lib/top.js';

test('top constants and default N', () => {
  assert.equal(TOP_FILENAME, 'top.json'); assert.equal(TOP_VERSION, 1);
  assert.equal(defaultTopN({}), 5); assert.equal(defaultTopN({ SCRIPT_TOP_N: '8' }), 8);
  assert.equal(defaultTopN({ SCRIPT_TOP_N: 'no' }), 5); assert.equal(defaultTopN({ SCRIPT_TOP_N: '0' }), 5);
});
test('effective set is top slice plus manual extras without duplicates', () => {
  const top = { ranking: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], extra: ['c', 'x'] };
  assert.deepEqual(rankingIds(top), ['a', 'b', 'c']);
  assert.deepEqual(effectiveIds(top, 2), ['a', 'b', 'c', 'x']);
  assert.deepEqual(effectiveIds({ ranking: [], extra: [] }, 5), []);
});
test('manual ids are registered once and expired ones are pruned', () => {
  const first = registerExtra({ ranking: [], extra: ['x'] }, ['y', 'x']);
  assert.deepEqual(first.added, ['y']); assert.deepEqual(first.top.extra, ['x', 'y']);
  const live = liveIds([{ id: 'x', status: 'NS' }, { id: 'y', status: 'FT' }, { id: 'z', status: 'NS' }]);
  assert.deepEqual(pruneExtra(first.top, live).extra, ['x']);
});
