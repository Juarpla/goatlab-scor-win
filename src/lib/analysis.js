/**
 * Resolution of LLM readings (`llm-analysis.json`) by identity, not only by
 * id: fixtures alternate between `af-` and `fd-` ids when the primary provider
 * changes, and a reading generated under the old id is left orphaned. Here that
 * twin is found by teams + date and re-pinned to the current id.
 */
import { sameTeam } from './bzzoiro.js';
import { toCompactInput } from './compact.js';

const text = value => String(value ?? '').trim();

/**
 * Input key that seals each reading (v3: adds kind and stats for the
 * board). Generation and comparison use this same function: if it matches, the
 * pipeline skips the match without spending calls.
 */
export function buildAnalysisKey(match, markets = null, ctx = {}) {
  return `v3|${toCompactInput(match, markets, ctx)}`;
}

/** The narrative may cite any figure from the input: all its data matters. */
export function buildMaterialKey(match, markets = null, ctx = {}) {
  return buildAnalysisKey(match, markets, ctx);
}

/** The old M/L seal omitted table, form and probabilities. It never proves freshness. */
export function analysisIsFresh(stored, match, markets = null, ctx = {}) {
  if (!stored || typeof stored !== 'object') return false;
  return typeof stored.inputKey === 'string' && stored.inputKey === buildAnalysisKey(match, markets, ctx);
}

/**
 * Splits the batch response into per-match values, without validating content
 * (validateAnalysis does that per item in the pipeline). Pure and testable:
 * returns `{ entries: [{ matchId, value }], issues: [{ matchId, reason }] }`.
 */
export function parseBatchAnalyses(parsed, expectedIds) {
  const ids = [...(expectedIds ?? [])];
  const list = parsed && typeof parsed === 'object' && Array.isArray(parsed.analyses) ? parsed.analyses : null;
  if (!list) throw new Error('Batch sin arreglo analyses');
  const entries = [];
  const issues = [];
  const seen = new Set();
  for (const item of list) {
    const matchId = item?.matchId;
    if (typeof matchId !== 'string' || !ids.includes(matchId)) {
      issues.push({ matchId: typeof matchId === 'string' ? matchId : null, reason: 'matchId inesperado' });
      continue;
    }
    if (seen.has(matchId)) {
      issues.push({ matchId, reason: 'matchId duplicado' });
      continue;
    }
    seen.add(matchId);
    entries.push({ matchId, value: item });
  }
  for (const id of ids) {
    if (!seen.has(id)) issues.push({ matchId: id, reason: 'sin lectura en el batch' });
  }
  return { entries, issues };
}

/** Identity of a calendar match. */
export function matchIdentity(match) {
  return {
    home: text(match?.home),
    away: text(match?.away),
    date: text(match?.kickoff).slice(0, 10),
  };
}

/** Identity of a stored entry: stamped fields or `inputKey` (v2 or legacy JSON). */
export function entryIdentity(entry) {
  if (!entry) return null;
  if (entry.home || entry.away || entry.kickoff) {
    return { home: text(entry.home), away: text(entry.away), date: text(entry.kickoff).slice(0, 10) };
  }
  const key = entry.inputKey;
  if (typeof key !== 'string' || !key) return null;
  if (key.startsWith('v2|') || key.startsWith('v3|')) {
    const row = key.slice(3).split('\n')[0].split('|');
    if (row[0] !== 'M' || !text(row[2]) || !text(row[3])) return null;
    return { home: text(row[2]), away: text(row[3]), date: text(row[5]).slice(0, 10) };
  }
  if (key.startsWith('{')) {
    try {
      const parsed = JSON.parse(key);
      const home = text(parsed?.home);
      const away = text(parsed?.away);
      if (!home || !away) return null;
      return { home, away, date: text(parsed?.kickoff).slice(0, 10) };
    } catch { return null; }
  }
  return null;
}

/** Same pairing (±1 day for kickoff shifts). Without a date on both sides, teams decide. */
export function sameFixture(a, b, { dayTolerance = 1 } = {}) {
  if (!a || !b || !a.home || !a.away || !b.home || !b.away) return false;
  if (!sameTeam(a.home, b.home) || !sameTeam(a.away, b.away)) return false;
  if (!a.date || !b.date) return !a.date && !b.date;
  const gap = Math.abs(Date.parse(`${a.date}T00:00:00Z`) - Date.parse(`${b.date}T00:00:00Z`));
  return Number.isFinite(gap) && gap <= dayTolerance * 86_400_000;
}

/**
 * Finds a match reading: direct id first; otherwise the twin by
 * identity. Returns `{ key, entry, via }` or null.
 */
export function findAnalysis(analyses, match) {
  if (!analyses || !match) return null;
  if (analyses[match.id]) return { key: match.id, entry: analyses[match.id], via: 'id' };
  const target = matchIdentity(match);
  for (const [key, entry] of Object.entries(analyses)) {
    if (key === match.id) continue;
    if (sameFixture(entryIdentity(entry), target)) return { key, entry, via: 'identity' };
  }
  return null;
}

/** The view and the generator check exactly the same input. */
export function findFreshAnalysis(analyses, match, markets = null, ctx = {}) {
  const found = findAnalysis(analyses, match);
  return found && analysisIsFresh(found.entry, match, markets, ctx) ? found : null;
}

/**
 * Re-pins twins to the current id and stamps identity on the entry. Pure:
 * returns a new map. Keeps the original input: changing an id does not
 * turn an old reading into a reading of current data.
 */
export function adoptAnalyses(analyses, matches) {
  const next = { ...(analyses ?? {}) };
  const adopted = [];
  for (const match of matches ?? []) {
    if (!match?.id || next[match.id]) continue;
    const found = findAnalysis(next, match);
    if (!found || found.via === 'id') continue;
    const entry = {
      ...found.entry,
      home: match.home ?? found.entry.home ?? null,
      away: match.away ?? found.entry.away ?? null,
      kickoff: match.kickoff ?? found.entry.kickoff ?? null,
      webId: match.webId ?? found.entry.webId ?? null,
      rekeyedFrom: found.key,
    };
    delete next[found.key];
    next[match.id] = entry;
    adopted.push({ from: found.key, to: match.id });
  }
  return { analyses: next, adopted };
}
