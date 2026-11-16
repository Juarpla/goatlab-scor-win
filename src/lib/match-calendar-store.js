import { DAY, MATCH_WINDOW, SCHEDULE_WINDOW, calendarPhase, fixtureIsIndexable, fixtureIsVisible, isSafeMatchId, matchRetirement } from './match-calendar.js';
import { archive, editorialReading, fixtures, ledger } from './match-feed.js';

let fallbackIndex;
const isStillScheduled = (match, now) => match.status === 'NS' && Date.parse(match.kickoff) > now;

function buildFallbackIndex() {
  const bySlug = new Map();
  for (const [slug, match] of Object.entries(ledger.snapshots)) {
    if (ledger.seen[slug]) bySlug.set(slug, { match, aliases: match.ids, terminalAt: Date.parse(ledger.seen[slug]), reading: null });
  }
  for (const match of Object.values(archive)) {
    const previous = bySlug.get(match.webId);
    bySlug.set(match.webId, { match, aliases: previous?.aliases ?? [], terminalAt: previous?.terminalAt, reading: match.reading });
  }
  for (const match of fixtures.matches) {
    const slug = match.webId ?? match.id;
    const previous = bySlug.get(slug);
    const saved = archive[slug];
    const sameKickoff = !previous || Date.parse(previous.match.kickoff) === Date.parse(match.kickoff);
    const reading = saved && sameKickoff ? saved.reading : null;
    bySlug.set(slug, { match, aliases: sameKickoff ? previous?.aliases ?? [] : [], terminalAt: sameKickoff ? previous?.terminalAt : null, reading });
  }

  const fallbackAliases = new Map();
  for (const [slug, value] of bySlug) {
    for (const id of [value.match.id, ...value.aliases]) {
      fallbackAliases.set(id, fallbackAliases.has(id) && fallbackAliases.get(id) !== slug ? null : slug);
    }
  }

  return { bySlug, fallbackAliases };
}

function fallbackMatch(id, now) {
  const { bySlug, fallbackAliases } = fallbackIndex ??= buildFallbackIndex();
  const slug = bySlug.has(id) ? id : fallbackAliases.get(id);
  const record = bySlug.get(slug);
  if (!record) return null;
  const { match } = record;
  const reading = record.reading ?? (match.status === 'NS' && Date.parse(match.kickoff) > now ? editorialReading(match) : null);
  const terminalAt = record.terminalAt ?? Math.max(Date.parse(match.kickoff), Date.parse(fixtures.updatedAt) || 0);
  return { slug, match, reading, retire_at: matchRetirement(match, { now, terminalAt, reading }), indexable: Boolean(reading) };
}

function fromRow(row) {
  return { slug: row.slug, match: row.payload ? JSON.parse(row.payload) : null, reading: row.reading ? JSON.parse(row.reading) : null, retire_at: row.retire_at, indexable: row.indexable === 1 };
}

const LIST = `SELECT slug, payload, reading, retire_at, indexable FROM match_calendar
 WHERE payload IS NOT NULL AND kickoff > ? AND kickoff <= ?
 ORDER BY kickoff, slug`;
const SYNC = 'SELECT feed_at, activated_at FROM match_calendar_sync WHERE id = 1';
const LIST_CACHE_KEY = 'https://goatlab.win/__goatlab_cache/calendar-list/v1';
const LIST_CACHE_SECONDS = 45;

export async function matchCalendar(env, now = Date.now(), cache = globalThis.caches?.default) {
  const snapshot = fallback(now);
  if (!env.GOATLAB_DB || env.GOATLAB_D1_MODE === 'json') return snapshot;
  let updatedAt = snapshot.updatedAt;
  let isDegraded = false;
  let listTiming;

  async function loadList(options) {
    let entry;
    try {
      const cached = await cache?.match(LIST_CACHE_KEY);
      if (cached) {
        const value = await cached.json();
        if (value?.rows === null || (Array.isArray(value?.rows) && Number.isFinite(value.feedAt))) entry = value;
      }
    } catch { /* The source is still available when the edge cache fails. */ }

    let rowsRead;
    if (entry) {
      listTiming = 'calendar-cache;desc="hit", calendar-d1-rows;desc="0"';
    } else {
      const db = env.GOATLAB_DB.withSession('first-primary');
      const { results: [sync], meta } = await db.prepare(SYNC).all();
      rowsRead = meta?.rows_read;
      if (sync?.activated_at) {
        // Include fixtures entering the window before the cached query expires.
        const { results, meta: listMeta } = await db.prepare(LIST)
          .bind(now - MATCH_WINDOW, now + SCHEDULE_WINDOW + LIST_CACHE_SECONDS * 1000).all();
        rowsRead = rowsRead == null || listMeta?.rows_read == null ? undefined : rowsRead + listMeta.rows_read;
        entry = { feedAt: sync.feed_at, rows: results };
      } else {
        entry = { rows: null };
      }
      listTiming = 'calendar-cache;desc="miss"';
      if (rowsRead != null) listTiming += `, calendar-d1-rows;desc="${rowsRead}"`;
      try {
        await cache?.put(LIST_CACHE_KEY, Response.json(entry, {
          headers: { 'Cache-Control': `public, max-age=${LIST_CACHE_SECONDS}` },
        }));
      } catch { /* Keep serving the successful database read. */ }
    }
    if (entry.rows === null) return snapshot.list(options);
    updatedAt = new Date(entry.feedAt).toISOString();
    return entry.rows.map(fromRow).filter(record => fixtureIsVisible(record.match, now));
  }

  async function loadDetail(id) {
    const db = env.GOATLAB_DB.withSession('first-primary');
    const sync = await db.prepare(SYNC).first();
    if (!sync?.activated_at) return snapshot.get(id);
    const row = await db.prepare(`SELECT slug, payload, reading, retire_at, indexable FROM match_calendar WHERE slug =
      COALESCE((SELECT slug FROM match_calendar WHERE slug = ?), (SELECT slug FROM match_calendar_alias WHERE alias = ?))`).bind(id, id).first();
    updatedAt = new Date(sync.feed_at).toISOString();
    return row ? fromRow(row) : null;
  }

  async function useSnapshot(method, input, failure) {
    // Local Wrangler gets its own empty D1 until the migration is applied.
    if (import.meta.env?.DEV && /no such table/i.test(String(failure.cause ?? failure.message))) {
      return snapshot[method](input);
    }
    isDegraded = true;
    updatedAt = snapshot.updatedAt;
    const age = now - Date.parse(snapshot.updatedAt);
    if (!(age >= 0)) throw failure;
    const stale = age > DAY;
    if (method === 'list') {
      const records = await snapshot.list({ ...input, upcomingOnly: stale });
      if (stale && !records.length) throw failure;
      return records;
    }
    const record = await snapshot.get(input);
    // A snapshot miss cannot distinguish an unknown fixture from a newer D1 row.
    // An older snapshot can still establish a final score or a scheduled kickoff.
    if (!record || (stale && !isStillScheduled(record.match, now) && calendarPhase(record.match, now) !== 'final')) throw failure;
    return record;
  }

  return {
    get updatedAt() { return updatedAt; },
    get isDegraded() { return isDegraded; },
    get listTiming() { return listTiming; },
    list: options => loadList(options).catch(error => {
      listTiming = 'calendar-cache;desc="fallback"';
      return useSnapshot('list', options, error);
    }),
    get: id => isSafeMatchId(id) ? loadDetail(id).catch(error => useSnapshot('get', id, error)) : Promise.resolve(null),
  };
}

function fallback(now) {
  return {
    updatedAt: fixtures.updatedAt,
    async list({ forSitemap = false, upcomingOnly = false } = {}) {
      return fixtures.matches.filter(match => fixtureIsVisible(match, now) && (!upcomingOnly || isStillScheduled(match, now))).map(match => forSitemap
        ? fallbackMatch(match.webId ?? match.id, now)
        : { match, slug: match.webId ?? match.id });
    },
    async get(id) {
      return isSafeMatchId(id) ? fallbackMatch(id, now) : null;
    },
  };
}

export function unavailableCalendar() {
  return { 'Retry-After': '300', 'Cache-Control': 'no-store' };
}

export function indexableFixtures(records, now = Date.now()) {
  return records.filter(({ match, indexable }) => fixtureIsIndexable(match, indexable, now));
}
