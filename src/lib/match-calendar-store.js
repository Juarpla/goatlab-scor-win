import { MATCH_WINDOW, SCHEDULE_WINDOW, fixtureIsIndexable, fixtureIsVisible, isSafeMatchId, matchRetirement } from './match-calendar.js';
import { archive, editorialReading, fixtures, ledger } from './match-feed.js';

let fallbackIndex;

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
    const reading = saved && sameKickoff ? saved.reading : editorialReading(match);
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
  const { match, reading } = record;
  const terminalAt = record.terminalAt ?? Math.max(Date.parse(match.kickoff), Date.parse(fixtures.updatedAt) || 0);
  return { slug, match, reading, retire_at: matchRetirement(match, { now, terminalAt, reading }), indexable: Boolean(reading) };
}

function fromRow(row) {
  return { slug: row.slug, match: row.payload ? JSON.parse(row.payload) : null, reading: row.reading ? JSON.parse(row.reading) : null, retire_at: row.retire_at, indexable: row.indexable === 1 };
}

const LIST = `SELECT slug, payload, reading, retire_at, indexable FROM match_calendar
 WHERE payload IS NOT NULL AND kickoff > ? AND kickoff <= ?
 ORDER BY kickoff, slug`;

export async function matchCalendar(env) {
  const now = Date.now();
  if (!env.GOATLAB_DB || env.GOATLAB_D1_MODE === 'json') return fallback(now);
  try {
    const db = env.GOATLAB_DB.withSession('first-primary');
    const sync = await db.prepare('SELECT feed_at, activated_at FROM match_calendar_sync WHERE id = 1').first();
    if (!sync?.activated_at) return fallback(now);
    return {
      updatedAt: new Date(sync.feed_at).toISOString(),
      async list() {
        const { results } = await db.prepare(LIST).bind(now - MATCH_WINDOW, now + SCHEDULE_WINDOW).all();
        return results.map(fromRow).filter(record => fixtureIsVisible(record.match, now));
      },
      async get(id) {
        if (!isSafeMatchId(id)) return null;
        const row = await db.prepare(`SELECT slug, payload, reading, retire_at, indexable FROM match_calendar WHERE slug =
          COALESCE((SELECT slug FROM match_calendar WHERE slug = ?), (SELECT slug FROM match_calendar_alias WHERE alias = ?))`).bind(id, id).first();
        return row ? fromRow(row) : null;
      },
    };
  } catch (error) {
    // Local Wrangler gets its own empty D1 until the migration is applied.
    if (import.meta.env.DEV && /no such table/i.test(String(error.cause ?? error.message))) return fallback(now);
    throw error;
  }
}

function fallback(now) {
  return {
    updatedAt: fixtures.updatedAt,
    async list() {
      return fixtures.matches.filter(match => fixtureIsVisible(match, now)).map(match => fallbackMatch(match.webId ?? match.id, now));
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
