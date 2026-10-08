import test from 'node:test';
import assert from 'node:assert/strict';
import { PRUNE_GRACE_MS, FINISHED_AT_TTL_MS, pruneDue, buildPruneContext, resolvePruneMatch, observeFinishedMatches, pruneAnalysisEntries, compactFinished } from '../src/lib/pruning.js';

const now = Date.parse('2026-10-08T22:00:00Z');
const iso = time => new Date(time).toISOString();
const fixture = overrides => ({ id: 'af-1', webId: 'home-vs-away-2026-10-08', home: 'Home', away: 'Away', competition: 'laliga', kickoff: iso(now - 3 * PRUNE_GRACE_MS), status: 'FT', homeScore: 2, awayScore: 0, ...overrides });
const observed = (match = fixture(), first = now - PRUNE_GRACE_MS - 1) => observeFinishedMatches(null, [match], first);

test('pruneDue requires official finish, numeric score, trustworthy observation and strict grace', () => {
  const cases = [
    ['NS', { status: 'NS' }, -1, false],
    ['LIVE', { status: 'LIVE' }, -1, false],
    ['HT', { status: 'HT' }, -1, false],
    ['FT before grace', {}, 1, false],
    ['FT exact grace', {}, 0, false],
    ['FT after grace', {}, -1, true],
    ['AET', { status: 'AET' }, -1, true],
    ['PEN', { status: 'PEN' }, -1, true],
    ['PST', { status: 'PST' }, -1, false],
    ['CANC', { status: 'CANC' }, -1, false],
    ['score missing', { awayScore: null }, -1, false],
    ['string score', { homeScore: '2' }, -1, false],
    ['future kickoff', { kickoff: iso(now + 1) }, -1, false],
    ['bad kickoff', { kickoff: 'unknown' }, -1, false],
    ['bad anchor', {}, 'broken', false],
    ['future anchor', {}, PRUNE_GRACE_MS + 1, false],
    ['absent match', null, -1, false],
  ];
  for (const [name, overrides, offset, expected] of cases) {
    const match = overrides === null ? null : fixture(overrides);
    const anchor = typeof offset === 'number' ? iso(now - PRUNE_GRACE_MS + offset) : offset;
    assert.equal(pruneDue(match, { [fixture().webId]: anchor }, now), expected, name);
  }
  assert.equal(pruneDue(fixture(), {}, now), false);
  assert.equal(pruneDue(fixture(), iso(now - 2 * PRUNE_GRACE_MS), now), false);
  assert.equal(pruneDue(fixture(), { [fixture().webId]: '2026-10-08' }, now), false);
});

test('first terminal observation is immutable while corrections preserve its episode', () => {
  const first = now - PRUNE_GRACE_MS - 1;
  const ledger = observed(fixture(), first);
  const original = structuredClone(ledger);
  const updated = observeFinishedMatches(ledger, [fixture({ status: 'AET', homeScore: 3 })], now);
  assert.equal(updated.seen[fixture().webId], iso(first));
  assert.equal(updated.snapshots[fixture().webId].homeScore, 3);
  assert.deepEqual(ledger, original);
});

test('invalid final does not establish a grace; regression starts a new episode', () => {
  for (const match of [fixture({ awayScore: null }), fixture({ kickoff: iso(now + 1) })]) {
    assert.deepEqual(observeFinishedMatches(null, [match], now).seen, {});
  }
  for (const status of ['NS', 'LIVE', 'PST']) {
    const regressed = observeFinishedMatches(observed(), [fixture({ status })], now);
    assert.equal(regressed.seen[fixture().webId], undefined);
    assert.equal(regressed.snapshots[fixture().webId].status, status);
    const restarted = observeFinishedMatches(regressed, [fixture()], now + 1);
    assert.equal(restarted.seen[fixture().webId], iso(now + 1));
  }
});

test('provider aliases share one canonical observation, including prior NS provider', () => {
  const previous = fixture({ id: 'fd-2', status: 'NS', homeScore: null, awayScore: null });
  const ledger = observeFinishedMatches(null, [fixture()], now - PRUNE_GRACE_MS - 1, { previousMatches: [previous] });
  assert.deepEqual(ledger.snapshots[fixture().webId].ids, ['af-1', 'fd-2']);
  const context = buildPruneContext([], ledger);
  for (const id of ['af-1', 'fd-2', fixture().webId]) {
    assert.equal(pruneDue(resolvePruneMatch(id, context), context.seen, now), true);
  }
  const changed = observeFinishedMatches(ledger, [fixture({ id: 'fd-2' })], now);
  assert.equal(changed.seen[fixture().webId], ledger.seen[fixture().webId]);
});

test('provider-only anchors migrate to canonical web ID without a new grace', () => {
  const prior = observed(fixture({ webId: null }));
  const canonical = observeFinishedMatches(prior, [fixture()], now);
  assert.equal(canonical.seen['af-1'], undefined);
  assert.equal(canonical.seen[fixture().webId], prior.seen['af-1']);
  assert.equal(canonical.snapshots['af-1'], undefined);
});
test('changing identity under reused IDs does not borrow a historical grace or aliases', () => {
  const ledger = observeFinishedMatches(null, [fixture()], now - PRUNE_GRACE_MS - 1, { previousMatches: [fixture({ id: 'fd-2' })] });
  for (const overrides of [{ home: 'Other Home' }, { away: 'Other Away' }, { competition: 'other' }, { kickoff: iso(now - 2 * PRUNE_GRACE_MS) }]) {
    const changed = fixture(overrides);
    const context = buildPruneContext([changed], ledger);
    assert.equal(pruneDue(resolvePruneMatch('af-1', context), context.seen, now), false);
    const observedAgain = observeFinishedMatches(ledger, [changed], now);
    assert.equal(observedAgain.seen[changed.webId], iso(now));
    assert.deepEqual(observedAgain.snapshots[changed.webId].ids, ['af-1']);
  }
});
test('malformed snapshot cannot authorize a current fixture through its orphaned anchor', () => {
  const ledger = observed();
  delete ledger.snapshots[fixture().webId].home;
  const context = buildPruneContext([fixture()], ledger);
  assert.equal(pruneDue(resolvePruneMatch('af-1', context), context.seen, now), false);
  const restarted = observeFinishedMatches(ledger, [fixture()], now);
  assert.equal(restarted.seen[fixture().webId], iso(now));
});

test('current nonterminal fixture overrides terminal snapshot for all aliases', () => {
  const ledger = observeFinishedMatches(null, [fixture()], now - PRUNE_GRACE_MS - 1, { previousMatches: [fixture({ id: 'fd-2' })] });
  const current = fixture({ id: 'fd-2', status: 'LIVE' });
  const context = buildPruneContext([current], ledger);
  assert.equal(resolvePruneMatch('af-1', context), current);
  assert.equal(pruneDue(resolvePruneMatch('af-1', context), context.seen, now), false);
  assert.equal(resolvePruneMatch('unknown', context), null);
});

test('corrupt ledger and ambiguous current identities never grant deletion', () => {
  for (const ledger of [null, [], {}, { version: 1, seen: {}, snapshots: [] }, { version: 2, seen: {}, snapshots: {} }]) {
    const context = buildPruneContext([fixture()], ledger);
    assert.equal(pruneDue(resolvePruneMatch('af-1', context), context.seen, now), false);
  }
  const context = buildPruneContext([fixture(), fixture({ id: 'fd-2', status: 'LIVE' })], observed());
  assert.equal(resolvePruneMatch(fixture().webId, context), null);
});

test('analysis pruning preserves unknowns, current live rows and in-memory newly generated entries', () => {
  const live = fixture({ id: 'af-live', webId: 'live', status: 'NS' });
  const context = buildPruneContext([live], observed());
  const entries = { 'af-1': { summary: 'retired' }, 'af-live': { summary: 'new' }, unknown: { summary: 'orphan' } };
  const retained = pruneAnalysisEntries(entries, context, now);
  assert.deepEqual(Object.keys(retained), ['af-live', 'unknown']);
  assert.equal(retained['af-live'], entries['af-live']);
  assert.equal(entries['af-1'].summary, 'retired');
});

test('seven-day compaction needs proven absence of artifacts and pending activity', () => {
  const first = now - FINISHED_AT_TTL_MS - 1;
  const old = observed(fixture({ kickoff: iso(first - PRUNE_GRACE_MS) }), first);
  assert.deepEqual(compactFinished(old, {}, now), old);
  assert.deepEqual(compactFinished(old, { hasArtifacts: false }, now), old);
  assert.deepEqual(compactFinished(old, { hasArtifacts: false, hasPending: () => undefined }, now), old);
  assert.deepEqual(compactFinished(old, { hasArtifacts: false, hasPending: () => Promise.resolve(false) }, now), old);
  const compacted = compactFinished(old, { hasArtifacts: () => false, hasPending: () => false }, now);
  assert.deepEqual(compacted.seen, {});
  assert.deepEqual(compacted.snapshots, {});
  assert.ok(old.seen[fixture().webId]);
});
