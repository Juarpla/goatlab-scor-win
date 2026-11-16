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
            return { async first() {
              if (failSync) throw quotaError;
              return { feed_at: now + 1000, activated_at: now };
            } };
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
