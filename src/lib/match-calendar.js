import { FINISHED_STATUSES, hasNumericScore } from './football.js';
import { findFreshAnalysis } from './analysis.js';
import { resolveMatchMarkets } from './probabilities.js';
import { normalizeReading } from './reading.js';

export const DAY = 86_400_000;
export const MATCH_WINDOW = 3 * 3_600_000;
export const SCHEDULE_WINDOW = 7 * DAY;
export const TOMBSTONE_WINDOW = 90 * DAY;
export const CANCELLED = new Set(['CANC', 'ABD', 'AWD', 'WO']);
export const PAUSED = new Set(['PST', 'TBD']);
export const LIVE = new Set(['LIVE', '1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT']);
const SUBSTANTIVE = new Set(['forma', 'historial', 'tabla', 'goleadores']);
export const isSafeMatchId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,179}$/i.test(id);

export function calendarPhase(match, now) {
  if (FINISHED_STATUSES.has(match.status) && hasNumericScore(match)) return 'final';
  if (CANCELLED.has(match.status)) return 'cancelled';
  const kickoff = Date.parse(match.kickoff);
  if (PAUSED.has(match.status) || FINISHED_STATUSES.has(match.status) || kickoff + MATCH_WINDOW <= now) return 'pending';
  if (kickoff > now) return 'upcoming';
  if (LIVE.has(match.status) || hasNumericScore(match)) return 'live';
  return 'pending';
}

export function fixtureIsVisible(match, now) {
  const kickoff = Date.parse(match.kickoff);
  return Number.isFinite(kickoff) && kickoff > now - MATCH_WINDOW && kickoff <= now + SCHEDULE_WINDOW
    && calendarPhase(match, now) !== 'final' && !CANCELLED.has(match.status) && !PAUSED.has(match.status);
}

export function pageReading(match, { analyses, results, standings, scorers, weather }) {
  const markets = resolveMatchMarkets({ match, results, scorers: scorers[match.competition] ?? null, standings });
  return findFreshAnalysis(analyses, match, markets, { results, standings, scorers, weather, market: match.marketConsensus ?? null })?.entry ?? null;
}

export function editorialMatch(match, entry) {
  const generated = Date.parse(entry?.generatedAt);
  if (entry?.review?.flag !== false || !Number.isFinite(generated) || generated >= Date.parse(match.kickoff)) return false;
  const sections = normalizeReading(entry)?.sections.filter(section => section.bullets.length >= 2) ?? [];
  return new Set(sections.map(section => section.kind)).size >= 2 && sections.some(section => SUBSTANTIVE.has(section.kind));
}

export function fixtureIsIndexable(match, verified, now) {
  return verified && match.status === 'NS' && Date.parse(match.kickoff) > now && fixtureIsVisible(match, now);
}

export function matchAvailability(record, now) {
  if (!record) return 404;
  if (record.retire_at == null || record.retire_at > now) return 200;
  return record.retire_at + TOMBSTONE_WINDOW > now ? 410 : 404;
}

export function matchRetirement(match, { now, terminalAt, reading }) {
  const kickoff = Date.parse(match.kickoff);
  const phase = calendarPhase(match, now);
  if (phase === 'cancelled') return (terminalAt ?? now) + 7 * DAY;
  if (reading) return null;
  if (phase === 'final') return (terminalAt ?? now) + 30 * DAY;
  if (PAUSED.has(match.status)) return Math.max(kickoff, terminalAt ?? now) + 30 * DAY;
  return kickoff + MATCH_WINDOW + 30 * DAY;
}
