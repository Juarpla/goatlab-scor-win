import test from 'node:test';
import assert from 'node:assert/strict';
import { TOP_FILENAME, TOP_VERSION, defaultTopN, effectiveIds, liveIds, rankingIds, registerExtra, pruneExtra } from '../src/lib/top.js';
import { observeFinishedMatches, PRUNE_GRACE_MS } from '../src/lib/pruning.js';

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
test('manual ids are registered once; a legacy NS set cannot prove a finish', () => {
  const first = registerExtra({ ranking: [], extra: ['x'] }, ['y', 'x']);
  assert.deepEqual(first.added, ['y']); assert.deepEqual(first.top.extra, ['x', 'y']);
  const live = liveIds([{ id: 'x', status: 'NS' }, { id: 'y', status: 'FT' }, { id: 'z', status: 'NS' }]);
  assert.deepEqual(pruneExtra(first.top, live).extra, ['x', 'y']);
});
test('manual extras survive unknown, LIVE and terminal grace, then retire from snapshots', () => {
  const now = Date.parse('2026-10-08T22:00:00Z');
  const terminal = { id: 'af-y', webId: 'y', home: 'Home', away: 'Away', competition: 'laliga', status: 'FT', kickoff: '2026-10-08T18:00:00Z', homeScore: 2, awayScore: 0 };
  const ledger = observeFinishedMatches(null, [terminal], now - PRUNE_GRACE_MS);
  const top = { ranking: [], extra: ['live', 'y', 'unknown'] };
  const live = { id: 'af-live', webId: 'live', status: 'LIVE' };
  assert.deepEqual(pruneExtra(top, [live, terminal], ledger, now).extra, top.extra);
  assert.deepEqual(pruneExtra(top, [live], ledger, now + 1).extra, ['live', 'unknown']);
});
