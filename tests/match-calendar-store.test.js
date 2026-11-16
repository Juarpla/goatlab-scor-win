import test from 'node:test';
import assert from 'node:assert/strict';
import { matchCalendar } from '../src/lib/match-calendar-store.js';
import { fixtures } from '../src/lib/match-feed.js';
import { fixtureIsVisible } from '../src/lib/match-calendar.js';

const now = Date.parse(fixtures.updatedAt);
const visible = fixtures.matches.filter(match => fixtureIsVisible(match, now));
const [match] = visible;
const slug = match.webId ?? match.id;
const quotaError = new Error('D1_ERROR: Daily row read limit exceeded');

function database(failSync) {
  return {
    withSession() {
      return {
        prepare(sql) {
          if (sql.includes('match_calendar_sync')) {
            const first = async () => {
              if (failSync) throw quotaError;
              return { feed_at: now + 1000, activated_at: now };
            };
            return { first, async all() { return { results: [await first()] }; } };
          }
          const fail = async () => { throw quotaError; };
          return { bind: () => ({ all: fail, first: fail }) };
        },
      };
    },
  };
}

for (const failSync of [true, false]) {
  test(`calendar serves the bundled schedule when D1 fails during ${failSync ? 'initialization' : 'a query'}`, async () => {
    assert.ok(visible.length);
    const env = { GOATLAB_DB: database(failSync) };
    const calendar = await matchCalendar(env, now);
    assert.deepEqual((await calendar.list()).map(record => record.match), visible);
    assert.equal(calendar.updatedAt, fixtures.updatedAt);
    assert.equal((await calendar.list({ forSitemap: true }))[0].slug, slug);

    const details = await matchCalendar(env, now);
    assert.equal((await details.get(slug)).slug, slug);
    assert.equal(details.updatedAt, fixtures.updatedAt);
    assert.equal((await details.get(match.id)).slug, slug);
    await assert.rejects(details.get('unknown-match-999999'), quotaError);
  });
}

test('an older snapshot retains upcoming fixtures and expires when its schedule runs out', async () => {
  const later = now + 25 * 3_600_000;
  const remaining = visible.filter(match => match.status === 'NS' && Date.parse(match.kickoff) > later);
  assert.ok(remaining.length, 'fixture snapshot must include upcoming matches beyond one day');
  const env = { GOATLAB_DB: database(true) };
  const calendar = await matchCalendar(env, later);
  assert.deepEqual((await calendar.list()).map(record => record.match), remaining);
  assert.equal(calendar.isDegraded, true);
  const [future] = remaining;
  assert.equal((await calendar.get(future.webId ?? future.id)).match.id, future.id);

  const exhausted = await matchCalendar(env, now + 8 * 86_400_000);
  await assert.rejects(exhausted.list(), quotaError);
  await assert.rejects(exhausted.get(future.webId ?? future.id), quotaError);
});

test('wall and sitemap requests share a calendar read and apply time boundaries after a cache hit', async () => {
  const storage = new Map();
  const cache = {
    async match(key) { return storage.get(key)?.clone(); },
    async put(key, response) { storage.set(key, response.clone()); },
  };
  const edgeMatch = { ...match, kickoff: new Date(now - 3 * 3_600_000 + 1000).toISOString(), status: 'NS' };
  let queries = 0;
  const response = results => ({ results, meta: { rows_read: results.length } });
  const env = { GOATLAB_DB: { withSession: () => ({ prepare(sql) {
    if (sql.includes('match_calendar_sync')) return {
      async all() { queries++; return response([{ feed_at: now, activated_at: now }]); },
      async first() { queries++; return { feed_at: now, activated_at: now }; },
    };
    return { bind: () => ({ async all() {
      queries++;
      return response([{ slug, payload: JSON.stringify(edgeMatch), reading: null, indexable: 1 }]);
    } }) };
  } }) } };
  const wall = await matchCalendar(env, now, cache);
  assert.equal((await wall.list()).length, 1);
  assert.equal(wall.listTiming, 'calendar-cache;desc="miss", calendar-d1-rows;desc="2"');
  assert.equal([...storage.values()][0].headers.get('Cache-Control'), 'public, max-age=45');
  const sitemap = await matchCalendar(env, now + 2000, cache);
  assert.deepEqual(await sitemap.list({ forSitemap: true }), []);
  assert.equal(sitemap.listTiming, 'calendar-cache;desc="hit", calendar-d1-rows;desc="0"');
  assert.equal(queries, 2);
  assert.equal(sitemap.updatedAt, fixtures.updatedAt);
});

test('a D1 error serves the snapshot without caching an outage', async () => {
  let writes = 0;
  const cache = { async match() { throw new Error('cache unavailable'); }, async put() { writes++; } };
  const calendar = await matchCalendar({ GOATLAB_DB: database(true) }, now, cache);
  assert.deepEqual((await calendar.list()).map(record => record.match), visible);
  assert.equal(calendar.listTiming, 'calendar-cache;desc="fallback"');
  assert.equal(writes, 0);
});

test('the shadow check can be cached without caching the bundled snapshot or changing detail reads', async () => {
  let entry;
  let sqlCalls = 0;
  const cache = {
    async match() { return entry?.clone(); },
    async put(key, response) { entry = response.clone(); },
  };
  const env = { GOATLAB_DB: { withSession: () => ({ prepare(sql) {
    assert.match(sql, /match_calendar_sync/);
    return {
      async all() { sqlCalls++; return { results: [{ activated_at: null }], meta: { rows_read: 1 } }; },
      async first() { sqlCalls++; return { activated_at: null }; },
    };
  } }) } };
  const initial = await matchCalendar(env, now, cache);
  assert.deepEqual((await initial.list()).map(record => record.match), visible);
  assert.deepEqual(await entry.clone().json(), { rows: null });

  const followUp = await matchCalendar(env, now, cache);
  assert.deepEqual((await followUp.list()).map(record => record.match), visible);
  assert.equal(followUp.isDegraded, false);
  assert.equal(followUp.listTiming, 'calendar-cache;desc="hit", calendar-d1-rows;desc="0"');
  assert.equal(sqlCalls, 1);
  assert.equal((await followUp.get(match.id)).slug, slug);
  assert.equal(sqlCalls, 2);
});
