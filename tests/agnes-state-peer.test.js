import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createAgnesState, reduceAgnesState, validateAgnesState } from '../src/lib/agnes-state.js';
import { AgnesStateClient } from '../fly/gateway/workspace/skills/goatlab/scripts/agnes-state.mjs';

const NOW = Date.parse('2026-10-09T06:00:00Z');
const DAY = 86400_000;
const hash = value => createHash('sha256').update(value).digest('hex');
const fresh = () => createAgnesState({ nowMs: NOW - DAY });
function request({ kind = 'image', matchId = 'peer-a', ordinal = 0, attemptId = 'first-attempt', at = NOW, ...rest } = {}) {
  return {
    matchId, kind, ordinal, attemptId, model: `agnes-${kind}-2.5-flash`, promptHash: hash('current prompt'),
    ...(kind === 'video' ? { referenceHash: hash('reference image') } : {}),
    expiresAtMs: at + DAY + 3600_000,
    guard: { manual: false, observedAtMs: at, kickoffMs: at + 3600_000, contextHash: hash('fixture snapshot') },
    ...rest,
  };
}
const transition = (state, operation, input, at = NOW) => reduceAgnesState(state, operation, input, { nowMs: at });
function pendingVideo() {
  const reserved = transition(fresh(), 'reserve', request({ kind: 'video' }));
  const accepted = transition(reserved.state, 'event', { attemptId: 'first-attempt', eventId: 'accepted-once', type: 'accepted', videoId: 'provider-video' });
  return accepted.state;
}

test('replayed creation permission is denied without charging quota twice', () => {
  const original = fresh(), input = request();
  const first = transition(original, 'reserve', input);
  assert.equal(first.result.canPost, true);
  const replay = transition(first.state, 'reserve', input);
  assert.equal(replay.result.canPost, false);
  assert.equal(replay.changed, false);
  assert.equal(replay.state.quota['2026-10-09'].images, 1);
  assert.deepEqual(original.quota, fresh().quota);
});

test('only one shared video flight can be created until the accepted task finishes', () => {
  const state = pendingVideo();
  const competing = transition(state, 'reserve', request({ kind: 'video', matchId: 'peer-b', attemptId: 'competing' }), NOW + 31_000);
  assert.equal(competing.result.canPost, false);
  assert.equal(competing.state.quota['2026-10-09'].video_seconds, 6);
  const complete = transition(state, 'event', { attemptId: 'first-attempt', eventId: 'completed-once', type: 'completed' });
  const next = transition(complete.state, 'reserve', request({ kind: 'video', matchId: 'peer-b', attemptId: 'next-attempt', at: NOW + 31_000 }), NOW + 31_000);
  assert.equal(next.result.canPost, true);
});

test('resolving one imported flight does not conceal another unresolved legacy task', () => {
  const legacySlots = ['legacy-a', 'legacy-b'].map(matchId => ({
    matchId, kind: 'video', ordinal: 0, promptHash: hash('legacy prompt'), referenceHash: hash('legacy reference'),
    model: 'agnes-video-2.5-flash', state: 'pending', videoId: `${matchId}-task`, expiresAtMs: NOW + 3600_000,
  }));
  const state = createAgnesState({ nowMs: NOW - DAY, legacyMatchIds: ['legacy-a', 'legacy-b'], legacySlots });
  const attemptId = state.slots['legacy-a:video:0'].attemptId;
  const firstDone = transition(state, 'event', { attemptId, eventId: 'legacy-a-completed', type: 'completed' });
  const attempt = transition(firstDone.state, 'reserve', request({ kind: 'video', matchId: 'new-match' }));
  assert.equal(attempt.result.canPost, false);
  assert.equal(firstDone.state.slots['legacy-b:video:0'].state, 'pending');
});

test('freshness and kickoff boundaries deny new paid work', () => {
  for (const guard of [
    { manual: false, observedAtMs: NOW - 60_001, kickoffMs: NOW + 3600_000, contextHash: hash('fixture') },
    { manual: false, observedAtMs: NOW, kickoffMs: NOW, contextHash: hash('fixture') },
    { manual: false, observedAtMs: NOW + 5001, kickoffMs: NOW + 3600_000, contextHash: hash('fixture') },
  ]) assert.equal(transition(fresh(), 'reserve', request({ guard })).result.canPost, false);
});

test('a string manual flag cannot bypass stale fixture checks', () => {
  const input = request({ guard: { manual: 'false', observedAtMs: NOW - 60_001, kickoffMs: NOW + 3600_000, contextHash: hash('fixture') } });
  let denied;
  try { denied = transition(fresh(), 'reserve', input).result.canPost === false; } catch { denied = true; }
  assert.equal(denied, true);
});

test('cutover quota cannot disappear and silently reopen the current day', () => {
  const state = createAgnesState({ nowMs: NOW });
  delete state.quota['2026-10-09'];
  assert.throws(() => validateAgnesState(state));
});

test('health rejects malformed persisted slot identities, counters and state types', () => {
  const state = transition(fresh(), 'reserve', request()).state;
  for (const patch of [
    { kind: 'unknown' }, { ordinal: -1 }, { state: 'unknown' }, { reservedUnits: '1' }, { expiresAtMs: 'invalid' }, { refunded: 'false' },
  ]) {
    const corrupted = structuredClone(state);
    Object.assign(corrupted.slots['peer-a:image:0'], patch);
    assert.throws(() => transition(corrupted, 'health', {}));
  }
  const corrupted = structuredClone(state);
  corrupted.quota['2026-10-09'].images = -1;
  assert.throws(() => transition(corrupted, 'health', {}));
});

test('authority refuses unsanitized fields in its actual nested schema', () => {
  const original = pendingVideo();
  const corruptions = [
    state => { state.rawResponse = 'provider body'; },
    state => { state.slots['peer-a:video:0'].prompt = 'raw prompt'; },
    state => { state.attempts['first-attempt'].resultUrl = 'https://signed.invalid/result'; },
    state => { state.usage.secretAccessKey = 'unexpected secret'; },
    state => { state.rates.extraCounter = 0; },
    state => { state.attempts.orphan = { slotKey: 'missing:video:0', state: 'pending', refunded: false, eventIds: [] }; },
    state => { state.slots['peer-a:video:0'].pollLease = { owner: 'reader', untilMs: NOW + 1000, rawHeaders: {} }; },
    state => { state.slots['peer-a:video:0'].uploadClaim = { id: 'upload', sha256: hash('media'), confirmed: false, resultUrl: 'https://signed.invalid/result' }; },
  ];
  for (const corrupt of corruptions) {
    const state = structuredClone(original);
    corrupt(state);
    assert.throws(() => transition(state, 'health', {}));
  }
});

test('polling leases deny another reader, reuse the owner lease and permit takeover after expiry', () => {
  const first = transition(pendingVideo(), 'pollclaim', { matchId: 'peer-a', kind: 'video', ordinal: 0, owner: 'reader-a' });
  assert.equal(first.result.canPoll, true);
  const owner = transition(first.state, 'pollclaim', { matchId: 'peer-a', kind: 'video', ordinal: 0, owner: 'reader-a' }, NOW + 1000);
  assert.equal(owner.result.canPoll, true);
  assert.equal(owner.changed, false);
  const competitor = transition(first.state, 'pollclaim', { matchId: 'peer-a', kind: 'video', ordinal: 0, owner: 'reader-b' }, NOW + 1000);
  assert.equal(competitor.result.canPoll, false);
  const takeover = transition(first.state, 'pollclaim', { matchId: 'peer-a', kind: 'video', ordinal: 0, owner: 'reader-b' }, NOW + 60_000);
  assert.equal(takeover.result.canPoll, true);
});

test('failed and expired tasks cannot acquire provider polling permission', () => {
  const state = pendingVideo();
  const terminal = transition(state, 'event', { attemptId: 'first-attempt', eventId: 'terminal-failed', type: 'failed' });
  assert.equal(transition(terminal.state, 'pollclaim', { matchId: 'peer-a', kind: 'video', ordinal: 0, owner: 'reader-a' }).result.canPoll, false);
  const expiresAtMs = state.slots['peer-a:video:0'].expiresAtMs;
  assert.equal(transition(state, 'pollclaim', { matchId: 'peer-a', kind: 'video', ordinal: 0, owner: 'reader-a' }, expiresAtMs).result.canPoll, false);
});

test('a completed task can recover its download by GET without another paid creation', () => {
  const complete = transition(pendingVideo(), 'event', { attemptId: 'first-attempt', eventId: 'completed-task', type: 'completed' });
  const recovered = transition(complete.state, 'pollclaim', { matchId: 'peer-a', kind: 'video', ordinal: 0, owner: 'new-run-after-kill' });
  assert.equal(recovered.result.canPoll, true);
  assert.equal(recovered.result.videoId, 'provider-video');
  assert.equal(recovered.result.attemptId, 'first-attempt');
  assert.equal(recovered.state.quota['2026-10-09'].video_seconds, 6);
  assert.equal(transition(recovered.state, 'reserve', request({ kind: 'video', attemptId: 'replacement-post' })).result.canPost, false);
});

test('expired unknown video retains its tombstone while releasing the global flight', () => {
  const state = transition(fresh(), 'reserve', request({ kind: 'video' })).state;
  const at = state.slots['peer-a:video:0'].expiresAtMs;
  const next = transition(state, 'reserve', request({ kind: 'video', matchId: 'peer-b', attemptId: 'new-day-flight', at }), at);
  assert.equal(next.result.canPost, true);
  assert.equal(next.state.slots['peer-a:video:0'].state, 'uncertain');
  assert.equal(transition(next.state, 'reserve', request({ kind: 'video', attemptId: 'repost-old', at }), at + 31_000).result.canPost, false);
});

test('confirmed 429 refunds once and cannot overwrite a completed creation', () => {
  const reserved = transition(fresh(), 'reserve', request());
  const event = { attemptId: 'first-attempt', eventId: 'definite-429', type: 'hard-rejected-429', httpStatus: 429, provenRejected: true, retryAfterMs: 1000 };
  const rejected = transition(reserved.state, 'event', event);
  assert.equal(rejected.state.quota['2026-10-09'].images, 0);
  const replay = transition(rejected.state, 'event', event);
  assert.equal(replay.changed, false);
  assert.equal(replay.state.quota['2026-10-09'].images, 0);
  const complete = transition(reserved.state, 'event', { attemptId: 'first-attempt', eventId: 'complete-image', type: 'completed' });
  assert.throws(() => transition(complete.state, 'event', event), /terminal/);
});

test('an uncertain result is not sufficient proof to publish arbitrary bytes', () => {
  const state = transition(fresh(), 'reserve', request()).state;
  let denied;
  try {
    denied = transition(state, 'uploadclaim', { matchId: 'peer-a', kind: 'image', ordinal: 0, claimId: 'upload', sha256: hash('arbitrary bytes') }).result.canPut === false;
  } catch { denied = true; }
  assert.equal(denied, true);
});

test('cleanup fence denies active unknown work and blocks future creation once it closes', () => {
  const state = transition(fresh(), 'reserve', request({ kind: 'video' })).state;
  const input = { matchId: 'peer-a', claimId: 'cleanup-fence', pruneDue: true };
  assert.equal(transition(state, 'cleanupclaim', input).result.canDelete, false);
  const expiresAtMs = state.slots['peer-a:video:0'].expiresAtMs;
  const closed = transition(state, 'cleanupclaim', input, expiresAtMs);
  assert.equal(closed.result.canDelete, true);
  assert.equal(transition(closed.state, 'reserve', request({ ordinal: 1, attemptId: 'after-cleanup', at: expiresAtMs }), expiresAtMs).result.canPost, false);
});

const credentials = { R2_STATE_ACCOUNT_ID: 'test-account', R2_STATE_ACCESS_KEY_ID: 'test-access', R2_STATE_SECRET_ACCESS_KEY: 'test-secret', R2_STATE_BUCKET: 'app-states', R2_STATE_KEY: 'goatlab/agnes-state.json' };
const snapshotResponse = (state, etag = '"revision-1"', headers = {}) => new Response(JSON.stringify(state), { headers: { etag, date: new Date(NOW).toUTCString(), ...headers } });

test('two state clients racing for one slot grant exactly one POST permission', async () => {
  let stored = fresh(), etag = '"revision-1"', reads = 0, putCount = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const fetchImpl = async (_url, options) => {
    if (options.method === 'GET') {
      const state = structuredClone(stored), tag = etag;
      if (++reads <= 2) { if (reads === 2) release(); await barrier; }
      return snapshotResponse(state, tag);
    }
    putCount++;
    if (options.headers['if-match'] !== etag) return new Response('', { status: 412 });
    stored = JSON.parse(options.body.toString());
    etag = `"revision-${putCount + 1}"`;
    return new Response('', { status: 200 });
  };
  const first = new AgnesStateClient({ env: credentials, fetchImpl });
  const second = new AgnesStateClient({ env: credentials, fetchImpl });
  const results = await Promise.all([first.transact('reserve', request()), second.transact('reserve', request({ attemptId: 'competing-run' }))]);
  assert.deepEqual(results.map(result => result.canPost).sort(), [false, true]);
  assert.equal(stored.quota['2026-10-09'].images, 1);
});

test('two distinct slots racing for the final quota unit cannot both create', async () => {
  let stored = fresh(), etag = '"quota-revision-1"', reads = 0, putCount = 0;
  stored.quota['2026-10-09'] = { images: 3999, video_seconds: 0 };
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const fetchImpl = async (_url, options) => {
    if (options.method === 'GET') {
      const state = structuredClone(stored), tag = etag;
      if (++reads <= 2) { if (reads === 2) release(); await barrier; }
      return snapshotResponse(state, tag);
    }
    putCount++;
    if (options.headers['if-match'] !== etag) return new Response('', { status: 412 });
    stored = JSON.parse(options.body.toString());
    etag = `"quota-revision-${putCount + 1}"`;
    return new Response('', { status: 200 });
  };
  const first = new AgnesStateClient({ env: credentials, fetchImpl });
  const second = new AgnesStateClient({ env: credentials, fetchImpl });
  const results = await Promise.all([
    first.transact('reserve', request()),
    second.transact('reserve', request({ matchId: 'peer-b', attemptId: 'distinct-quota-racer' })),
  ]);
  assert.deepEqual(results.map(result => result.canPost).sort(), [false, true]);
  assert.equal(stored.quota['2026-10-09'].images, 4000);
  assert.equal(Object.keys(stored.slots).length, 1);
});

test('an acknowledged-lost R2 PUT never permits the provider POST on replay', async () => {
  let stored = fresh(), writes = 0;
  const fetchImpl = async (_url, options) => {
    if (options.method === 'GET') return snapshotResponse(stored);
    writes++;
    stored = JSON.parse(options.body.toString());
    throw new Error('connection closed after write');
  };
  const client = new AgnesStateClient({ env: credentials, fetchImpl });
  await assert.rejects(client.transact('reserve', request()), /incierto/);
  const replay = await client.transact('reserve', request());
  assert.equal(replay.canPost, false);
  assert.equal(writes, 1);
  assert.equal(stored.quota['2026-10-09'].images, 1);
});

test('missing or corrupt authority has no automatic bootstrap writes', async () => {
  for (const response of [new Response('', { status: 404 }), new Response('{', { headers: { etag: '"etag"', date: new Date(NOW).toUTCString() } })]) {
    const methods = [];
    const client = new AgnesStateClient({ env: credentials, fetchImpl: async (_url, options) => { methods.push(options.method); return response; } });
    await assert.rejects(client.transact('reserve', request()));
    assert.deepEqual(methods, ['GET']);
  }
});

test('state transport refuses other keys and incomplete credential pairs', async () => {
  let requests = 0;
  for (const env of [
    { ...credentials, R2_STATE_KEY: 'goatlab/another-app.json' },
    { R2_ACCOUNT_ID: 'media-account', R2_ACCESS_KEY_ID: 'media-access' },
  ]) {
    const client = new AgnesStateClient({ env, fetchImpl: async () => { requests++; return snapshotResponse(fresh()); } });
    await assert.rejects(client.transact('health', {}), /configuración/);
  }
  assert.equal(requests, 0);
});

test('health requires a trusted clock and opaque ETag, and never writes state', async () => {
  const methods = [];
  const client = new AgnesStateClient({ env: credentials, fetchImpl: async (_url, options) => { methods.push(options.method); return snapshotResponse(fresh()); } });
  assert.equal((await client.transact('health', {})).ready, true);
  assert.deepEqual(methods, ['GET']);
  for (const headers of [{ date: 'invalid' }, { etag: '' }]) {
    const invalid = new AgnesStateClient({ env: credentials, fetchImpl: async () => snapshotResponse(fresh(), '"etag"', headers) });
    await assert.rejects(invalid.transact('health', {}), /ETag|reloj/);
  }
});
