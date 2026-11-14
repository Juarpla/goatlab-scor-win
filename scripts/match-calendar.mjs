import { readFile } from 'node:fs/promises';
import { getFixtures } from '../src/lib/football.js';
import { sameClub } from '../src/lib/teams.js';
import { withScorerFallback } from '../src/lib/probabilities.js';
import {
  DAY, MATCH_WINDOW, TOMBSTONE_WINDOW, calendarPhase, editorialMatch, fixtureIsVisible,
  isSafeMatchId, matchRetirement, pageReading,
} from '../src/lib/match-calendar.js';

const env = process.env;
const now = Date.now();
const mode = process.argv[2] ?? 'simulate';
const source = name => readFile(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8').then(JSON.parse);
const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const databaseId = env.GOATLAB_D1_DATABASE_ID || config.match(/"database_id":\s*"([^"]+)"/)?.[1];
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${databaseId}/query`;

async function query(body) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !databaseId || !env.GOATLAB_D1_API_TOKEN) throw new Error('Missing D1 credentials');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GOATLAB_D1_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(45_000),
  });
  const json = await response.json();
  if (!response.ok || !json.success || json.result?.some(row => !row.success)) {
    throw new Error(`D1 query failed (${response.status}): ${json.errors?.map(({ code, message }) => `${code} ${message}`).join('; ')}`);
  }
  return json.result.map(row => row.results);
}

if (mode === 'migrate') {
  const sql = await readFile(new URL('../migrations/0001_match_calendar.sql', import.meta.url), 'utf8');
  await query({ sql });
  console.log('Match calendar schema verified.');
} else if (['sync', 'reconcile', 'simulate', 'prune'].includes(mode)) {
  await run();
} else {
  throw new Error(`Unknown calendar mode: ${mode}`);
}

async function run() {
  const fixtures = await source('fixtures');
  const feedAt = Date.parse(fixtures.updatedAt);
  if (!Number.isFinite(feedAt) || feedAt > now + 300_000 || !Array.isArray(fixtures.matches)) throw new Error('Invalid fixture snapshot');
  const [[sync], existing, existingAliases] = await query({ batch: [
    { sql: 'SELECT * FROM match_calendar_sync WHERE id = 1' },
    { sql: 'SELECT * FROM match_calendar' },
    { sql: 'SELECT alias, slug FROM match_calendar_alias' },
  ] });
  if (mode === 'prune') return prune(sync, existing, existingAliases);
  const records = new Map(existing.map(row => [row.slug, row]));
  const aliases = new Map(existingAliases.map(row => [row.alias, row.slug]));
  const changes = mode === 'reconcile' ? await reconcile(records) : await importFeed(fixtures, feedAt, records, aliases);
  const visibleSource = fixtures.matches.filter(match => fixtureIsVisible(match, now));
  const visibleNext = [...records.values()].filter(row => row.match && fixtureIsVisible(row.match, now));
  const visibleSlugs = new Set(visibleNext.map(row => row.slug));
  const previousSlugs = new Set(existing.filter(row => row.payload && fixtureIsVisible(JSON.parse(row.payload), now)).map(row => row.slug));
  const removed = [...previousSlugs].filter(slug => !visibleSlugs.has(slug)).length;
  const added = visibleNext.filter(row => !previousSlugs.has(row.slug)).length;
  const unexpected = removed > 10 || (previousSlugs.size > 0 && removed / previousSlugs.size > 0.20);
  // The comparison accepts provider-confirmed transitions absent from the batch snapshot.
  const missing = visibleSource.filter(match => {
    const slug = aliases.get(match.id) ?? match.webId ?? match.id;
    const row = records.get(slug);
    return !row || (!row.match && row.retire_at > now) || (!visibleSlugs.has(slug) && row.observed_at <= feedAt && row.status === match.status);
  });
  const healthy = now - feedAt <= DAY && !unexpected && missing.length === 0;
  if (fixtures.sourceErrors?.length) console.warn(`Source reported ${fixtures.sourceErrors.length} warnings.`);
  console.log(JSON.stringify({ mode, source: fixtures.matches.length, visibleSource: visibleSource.length, visibleD1: visibleNext.length, removed, added, missing: missing.length, healthy, changes: changes.length }));
  if (mode === 'simulate') return;
  // The shadow streak is reset by an unhealthy import or a gap in successful imports.
  // The independent, lightweight reconciliation must not advance the import checkpoint.
  if (mode === 'sync' && feedAt >= (sync?.feed_at ?? 0)) {
    const shadowStarted = healthy && sync?.healthy && now - sync.rollout_check_at <= DAY
      ? sync.shadow_started_at : now;
    const activated = sync?.activated_at ?? (healthy && now - shadowStarted >= 7 * DAY ? now : null);
    changes.push({
      sql: `INSERT INTO match_calendar_sync VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET feed_at=excluded.feed_at, shadow_started_at=excluded.shadow_started_at,
        activated_at=excluded.activated_at, rollout_check_at=excluded.rollout_check_at, healthy=excluded.healthy
        WHERE excluded.feed_at >= match_calendar_sync.feed_at`,
      params: [feedAt, shadowStarted, activated, now, Number(healthy)],
    });
    if (activated && !sync?.activated_at) console.log('D1 activated after seven healthy shadow days.');
  }
  // The last batch includes the checkpoint, so failed partial imports are safely retryable.
  for (let cursor = 0; cursor < changes.length; cursor += 75) {
    await query({ batch: changes.slice(cursor, cursor + 75) });
  }
}

function sameFixture(a, b) {
  return a && b && a.competition === b.competition && sameClub(a.home, b.home) && sameClub(a.away, b.away);
}

function save({ match, slug, previous, observedAt, reading, terminalAt, indexable, ids = [] }) {
  const phase = calendarPhase(match, now);
  const sameEpisode = previous?.match && previous.kickoff === Date.parse(match.kickoff) && calendarPhase(previous.match, now) === phase;
  const finishedAt = ['final', 'cancelled'].includes(phase)
    ? (sameEpisode ? previous.finished_at : null) ?? terminalAt ?? observedAt
    : null;
  const retireAt = matchRetirement(match, { now: observedAt, terminalAt: finishedAt, reading });
  const record = {
    slug, kickoff: Date.parse(match.kickoff), status: match.status, observed_at: observedAt,
    finished_at: finishedAt, retire_at: retireAt, indexable: Number(indexable), match: { ...match, webId: slug }, reading,
  };
  return {
    record,
    changes: [{
      sql: `INSERT INTO match_calendar (slug, kickoff, status, observed_at, finished_at, retire_at, indexable, payload, reading)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET kickoff=excluded.kickoff, status=excluded.status, observed_at=excluded.observed_at,
          finished_at=excluded.finished_at, retire_at=excluded.retire_at, indexable=excluded.indexable,
          payload=excluded.payload, reading=excluded.reading
        WHERE excluded.observed_at >= match_calendar.observed_at`,
      params: [slug, record.kickoff, match.status, observedAt, finishedAt, retireAt, record.indexable, JSON.stringify(record.match), reading ? JSON.stringify(reading) : null],
    }, ...[...new Set(ids)].filter(id => isSafeMatchId(id) && id !== slug).map(id => ({
      sql: 'INSERT OR IGNORE INTO match_calendar_alias (alias, slug) VALUES (?, ?)',
      params: [id, slug],
    }))],
  };
}

async function importFeed(fixtures, feedAt, records, aliases) {
  const [archive, ledger, analyses, results, standings, scorers, fallback, weather] = await Promise.all(
    ['match-archive', 'finished-at', 'llm-analysis', 'results', 'standings', 'scorers', 'scorer-fallback', 'weather'].map(source),
  );
  const context = { analyses, results: results.results, standings, scorers: withScorerFallback(scorers, fallback), weather };
  for (const row of records.values()) {
    row.match = row.payload ? JSON.parse(row.payload) : null;
    row.reading = row.reading ? JSON.parse(row.reading) : null;
  }
  const combined = new Map();
  for (const [slug, match] of Object.entries(ledger.snapshots)) {
    if (ledger.seen[slug]) combined.set(slug, { match, terminalAt: Date.parse(ledger.seen[slug]), ids: match.ids ?? [] });
  }
  for (const match of Object.values(archive)) {
    const previous = combined.get(match.webId);
    combined.set(match.webId, { match, reading: match.reading, terminalAt: previous?.terminalAt ?? Date.parse(match.kickoff), ids: previous?.ids ?? [] });
  }
  for (const match of fixtures.matches) {
    const slug = match.webId ?? match.id;
    const previous = combined.get(slug);
    const sameKickoff = previous && Date.parse(previous.match.kickoff) === Date.parse(match.kickoff);
    combined.set(slug, { match, reading: sameKickoff ? previous.reading : null, terminalAt: sameKickoff ? previous.terminalAt : null, ids: sameKickoff ? previous.ids : [] });
  }
  const changes = [];
  for (const [sourceSlug, { match, reading, terminalAt, ids }] of combined) {
    if (!isSafeMatchId(sourceSlug) || !isSafeMatchId(match.id) || !Number.isFinite(Date.parse(match.kickoff))) continue;
    const aliased = records.get(aliases.get(match.id) ?? match.id);
    const slug = sameFixture(match, aliased?.match) ? aliased.slug : sourceSlug;
    const previous = records.get(slug);
    if (previous && !previous.match && (!fixtureIsVisible(match, now) || feedAt <= previous.observed_at)) continue;
    const phase = calendarPhase(match, now);
    const isUpcoming = phase === 'upcoming';
    const entry = isUpcoming ? pageReading(match, context) : null;
    const indexable = editorialMatch(match, entry);
    // A verified reading survives the end of the same fixture, including an early final from reconciliation.
    const saved = reading ?? (previous?.kickoff === Date.parse(match.kickoff) ? previous.reading : null);
    if (previous && feedAt < previous.observed_at) {
      const promoted = calendarPhase(previous.match, now) === 'upcoming' &&
        previous.kickoff === Date.parse(match.kickoff) && previous.status === match.status &&
        editorialMatch(previous.match, entry) && pageReading(previous.match, context) === entry;
      if (promoted && !previous.indexable) {
        previous.reading = entry;
        previous.indexable = 1;
        changes.push({ sql: 'UPDATE match_calendar SET reading = ?, indexable = 1, retire_at = NULL WHERE slug = ? AND observed_at = ?', params: [JSON.stringify(entry), slug, previous.observed_at] });
      }
      if (saved && !previous.reading && calendarPhase(previous.match, now) === 'final' && editorialMatch(previous.match, { ...saved, review: saved.review ?? { flag: false } })) {
        previous.reading = saved;
        previous.retire_at = null;
        changes.push({ sql: 'UPDATE match_calendar SET reading = ?, retire_at = NULL WHERE slug = ? AND kickoff = ? AND observed_at = ?', params: [JSON.stringify(saved), slug, previous.kickoff, previous.observed_at] });
      }
      continue;
    }
    if (previous?.match && previous.kickoff === Date.parse(match.kickoff)
      && ['final', 'cancelled'].includes(calendarPhase(previous.match, now)) && !['final', 'cancelled'].includes(phase)) continue;
    const keeper = isUpcoming ? (indexable ? entry : null) : editorialMatch(match, { ...saved, review: saved?.review ?? { flag: false } }) ? saved : null;
    const savedAt = Number.isFinite(terminalAt) ? terminalAt : undefined;
    const next = save({ match, slug, previous, observedAt: feedAt, reading: keeper, terminalAt: savedAt, indexable, ids: [sourceSlug, match.id, ...ids] });
    if (!previous && !keeper && next.record.retire_at + TOMBSTONE_WINDOW <= now) continue;
    if (previous && previous.observed_at === feedAt && JSON.stringify(previous.match) === JSON.stringify(next.record.match)
      && JSON.stringify(previous.reading) === JSON.stringify(next.record.reading)) continue;
    records.set(slug, next.record);
    for (const id of [sourceSlug, match.id, ...ids]) if (!aliases.has(id)) aliases.set(id, slug);
    changes.push(...next.changes);
  }
  return changes;
}

async function reconcile(records) {
  for (const row of records.values()) {
    row.match = row.payload ? JSON.parse(row.payload) : null;
    row.reading = row.reading ? JSON.parse(row.reading) : null;
  }
  const candidates = [...records.values()].filter(row => row.match && !['final', 'cancelled'].includes(calendarPhase(row.match, now))
    && row.kickoff > now - 8 * 3_600_000 && row.kickoff <= now + 3_600_000);
  if (!candidates.length) return [];
  // UTC date spans midnight. Fetch only dates with candidates, at most three.
  const days = [...new Set(candidates.map(row => new Date(row.kickoff).toISOString().slice(0, 10)))].slice(-3);
  const updates = [];
  for (const date of days) {
    const result = await getFixtures({ date, env });
    if (!result.unavailable) updates.push(...result.matches);
  }
  const changes = [];
  for (const previous of candidates) {
    const fresh = updates.find(match => match.id === previous.match.id && sameFixture(match, previous.match))
      ?? updates.find(match => Date.parse(match.kickoff) === previous.kickoff && sameFixture(match, previous.match));
    if (!fresh || (fresh.status === 'NS' && calendarPhase(previous.match, now) === 'live')) continue;
    const sameKickoff = previous.kickoff === Date.parse(fresh.kickoff);
    const match = { ...previous.match, status: fresh.status, kickoff: fresh.kickoff, minute: fresh.minute,
      homeScore: fresh.homeScore, awayScore: fresh.awayScore };
    if (['status', 'kickoff', 'minute', 'homeScore', 'awayScore'].every(key => match[key] === previous.match[key])) continue;
    const next = save({ match, slug: previous.slug, previous, observedAt: now, reading: sameKickoff ? previous.reading : null,
      indexable: sameKickoff && previous.indexable === 1, ids: [fresh.id] });
    records.set(previous.slug, next.record);
    changes.push(...next.changes);
  }
  return changes;
}

async function prune(sync, records, aliases) {
  if (!sync?.activated_at || now - sync.activated_at < 7 * DAY || now - sync.feed_at > DAY || !sync.healthy) {
    console.log('Physical pruning skipped: rollout or feed-health gate.');
    return;
  }
  const backlog = records.filter(row => row.retire_at != null && (row.payload && row.retire_at <= now || row.retire_at <= now - TOMBSTONE_WINDOW))
    .sort((a, b) => a.retire_at - b.retire_at);
  const cutoff = Math.max(1, Math.min(10, Math.floor(records.length * 0.20)));
  const recent = backlog.filter(row => row.retire_at > now - DAY);
  if (recent.length > cutoff) {
    console.warn(`Physical pruning paused for review: ${recent.length} newly retired records out of ${records.length}.`);
    return;
  }
  const due = backlog.slice(0, cutoff);
  if (!due.length) return;
  console.log(`Prune batch: ${due.length} of ${backlog.length} eligible rows.`);
  // D1 Time Travel is automatic. Export the exact before-images to the workflow artifact as well.
  const { writeFile } = await import('node:fs/promises');
  const slugs = new Set(due.map(row => row.slug));
  await writeFile('calendar-prune-backup.json', JSON.stringify({ recordedAt: new Date(now).toISOString(), records: due, aliases: aliases.filter(row => slugs.has(row.slug)) }), { mode: 0o600 });
  if (process.argv.includes('--dry-run')) return;
  await query({ batch: [
    { sql: 'UPDATE match_calendar SET payload=NULL, reading=NULL, indexable=0 WHERE slug IN (SELECT value FROM json_each(?)) AND retire_at <= ?', params: [JSON.stringify([...slugs]), now] },
    { sql: 'DELETE FROM match_calendar WHERE slug IN (SELECT value FROM json_each(?)) AND retire_at <= ? AND payload IS NULL', params: [JSON.stringify([...slugs]), now - TOMBSTONE_WINDOW] },
  ] });
  console.log(`Compacted or removed ${due.length} expired records.`);
}
