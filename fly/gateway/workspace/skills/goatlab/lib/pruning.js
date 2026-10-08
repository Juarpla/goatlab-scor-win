/** Conservative retirement of match artifacts; independent of feeds and storage. */
export const PRUNE_GRACE_MS = 3_600_000;
export const FINISHED_AT_TTL_MS = 7 * 24 * 3_600_000;
const FINISHED = new Set(['FT', 'AET', 'PEN']);
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN;
const matchKey = match => match?.webId ?? match?.id;
const numericScore = match => Number.isFinite(match?.homeScore) && Number.isFinite(match?.awayScore);
const validLedger = ledger => record(ledger) && ledger.version === 1 && record(ledger.seen) && record(ledger.snapshots);
const snapshotIds = (key, snapshot) => [...new Set([key, snapshot?.id, snapshot?.webId, ...(Array.isArray(snapshot?.ids) ? snapshot.ids : [])].filter(safeId))];
const identity = match => typeof match?.home === 'string' && match.home.trim() && typeof match?.away === 'string' && match.away.trim() && typeof match?.competition === 'string' && match.competition.trim() && Number.isFinite(stamp(match.kickoff));
const sameIdentity = (a, b) => identity(a) && identity(b) && a.home === b.home && a.away === b.away && a.competition === b.competition && stamp(a.kickoff) === stamp(b.kickoff);
const validSnapshot = (key, snapshot) => safeId(key) && record(snapshot) && matchKey(snapshot) === key && safeId(snapshot.id) && identity(snapshot) && Array.isArray(snapshot.ids) && snapshot.ids.every(safeId);

/** `seen` is an ID -> ISO timestamp map, never an estimated finish time. */
export function pruneDue(match, seen, now = Date.now()) {
  if (!match || !FINISHED.has(match.status) || !numericScore(match) || !record(seen) || !Number.isFinite(now)) return false;
  const key = matchKey(match);
  if (!safeId(key) || !Object.hasOwn(seen, key)) return false;
  const kickoff = stamp(match.kickoff), finishedAt = stamp(seen[key]);
  return Number.isFinite(kickoff) && Number.isFinite(finishedAt)
    && kickoff <= finishedAt && finishedAt <= now && now - finishedAt > PRUNE_GRACE_MS;
}

/** Current fixtures override all historical aliases; contradictory IDs are unknown. */
export function buildPruneContext(matches = [], ledger = null) {
  const byId = new Map(), seen = {}, snapshots = validLedger(ledger) ? ledger.snapshots : {};
  const anchors = validLedger(ledger) ? ledger.seen : {};
  const snapshotById = new Map();
  for (const [key, snapshot] of Object.entries(snapshots)) {
    if (!validSnapshot(key, snapshot)) continue;
    for (const id of snapshotIds(key, snapshot)) {
      if (snapshotById.has(id) && snapshotById.get(id).key !== key) snapshotById.set(id, { key: null, match: null });
      else snapshotById.set(id, { key, match: snapshot });
    }
  }
  for (const [id, saved] of snapshotById) {
    byId.set(id, saved.match);
    if (saved.key && Object.hasOwn(anchors, saved.key)) seen[id] = anchors[saved.key];
  }
  const currentById = new Map();
  for (const match of Array.isArray(matches) ? matches : []) {
    const key = matchKey(match);
    if (!safeId(key) || !safeId(match?.id)) continue;
    const saved = snapshotById.get(key) ?? snapshotById.get(match.id);
    const ids = [...new Set([key, match.id, ...(saved?.key ? snapshotIds(saved.key, saved.match) : [])])];
    const anchor = saved?.key && sameIdentity(match, saved.match) ? anchors[saved.key] : undefined;
    for (const id of ids) {
      if (currentById.has(id) && currentById.get(id) !== match) currentById.set(id, null);
      else currentById.set(id, match);
      if (anchor !== undefined) seen[id] = anchor;
      else delete seen[id];
    }
    if (anchor !== undefined) seen[key] = anchor;
  }
  for (const [id, match] of currentById) byId.set(id, match);
  return { byId, seen };
}

export function resolvePruneMatch(id, context) {
  return safeId(id) && context?.byId instanceof Map ? context.byId.get(id) ?? null : null;
}

/** Observe genuine feed updates only; a regression starts a new terminal episode. */
export function observeFinishedMatches(ledger, matches, now = Date.now(), { previousMatches = [] } = {}) {
  const base = validLedger(ledger) ? ledger : { seen: {}, snapshots: {} };
  const seen = { ...base.seen }, snapshots = Object.fromEntries(Object.entries(base.snapshots).filter(([key, value]) => validSnapshot(key, value)).map(([key, value]) => [key, { ...value, ids: [...value.ids] }]));
  const prior = buildPruneContext(previousMatches, { version: 1, seen, snapshots });
  for (const match of Array.isArray(matches) ? matches : []) {
    const key = matchKey(match);
    if (!safeId(key) || !safeId(match?.id)) continue;
    const oldEntry = Object.entries(snapshots).find(([oldKey, snapshot]) => oldKey === key || snapshotIds(oldKey, snapshot).includes(match.id));
    const [oldKey, old] = oldEntry ?? [key, null];
    const previous = resolvePruneMatch(key, prior) ?? resolvePruneMatch(match.id, prior);
    const continuous = sameIdentity(old, match);
    const priorAnchor = seen[oldKey];
    const ids = [...new Set([...(continuous ? old.ids : []), continuous ? old.id : null, match.id, sameIdentity(previous, match) ? previous.id : null].filter(safeId))];
    const kickoff = stamp(match.kickoff);
    const terminal = FINISHED.has(match.status) && numericScore(match) && Number.isFinite(kickoff) && kickoff <= now;
    if (!terminal && !old) continue;
    const next = { id: match.id, webId: safeId(match.webId) ? match.webId : null, ids, home: match.home ?? null, away: match.away ?? null, competition: match.competition ?? null, kickoff: match.kickoff ?? null, status: match.status ?? null, homeScore: match.homeScore ?? null, awayScore: match.awayScore ?? null };
    if (oldKey !== key) { delete snapshots[oldKey]; delete seen[oldKey]; }
    snapshots[key] = next;
    if (terminal) {
      const first = continuous ? stamp(priorAnchor) : NaN;
      seen[key] = Number.isFinite(first) && kickoff <= first && first <= now ? new Date(first).toISOString() : new Date(now).toISOString();
    } else if (!FINISHED.has(match.status) || !Number.isFinite(kickoff) || kickoff > now) delete seen[key];
  }
  return { version: 1, updatedAt: new Date(now).toISOString(), seen, snapshots };
}

/** Unknown entries survive. The map stays in memory to preserve newly generated rows. */
export function pruneAnalysisEntries(analyses, context, now = Date.now()) {
  return Object.fromEntries(Object.entries(record(analyses) ? analyses : {}).filter(([id]) => !pruneDue(resolvePruneMatch(id, context), context?.seen, now)));
}

/** Storage/activity proofs are explicit; unavailable or asynchronous proofs retain. */
export function compactFinished(ledger, { hasArtifacts = true, hasPending = true } = {}, now = Date.now()) {
  if (!validLedger(ledger)) return ledger;
  const seen = { ...ledger.seen }, snapshots = { ...ledger.snapshots };
  for (const [key, firstSeen] of Object.entries(seen)) {
    const at = stamp(firstSeen);
    if (!Number.isFinite(at) || now - at <= FINISHED_AT_TTL_MS) continue;
    const artifacts = typeof hasArtifacts === 'function' ? hasArtifacts(key, snapshots[key]) : hasArtifacts;
    const pending = typeof hasPending === 'function' ? hasPending(key, snapshots[key]) : hasPending;
    if (artifacts !== false || pending !== false) continue;
    delete seen[key]; delete snapshots[key];
  }
  return { ...ledger, seen, snapshots };
}
