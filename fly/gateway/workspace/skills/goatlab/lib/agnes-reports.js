/** Public projections of the private Agnes authority. Unknown fields never leave R2. */
import { createHash } from 'node:crypto';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const validDay = value => DAY.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function mergeQuotaReports(local = {}, remote = {}, now = Date.now()) {
  const output = {};
  for (const source of [local, remote]) {
    for (const [day, value] of Object.entries(source ?? {})) {
      if (!validDay(day) || !value || !Number.isInteger(value.images) || value.images < 0 || !count(value.video_seconds)) continue;
      const previous = output[day] ?? { images: 0, video_seconds: 0 };
      output[day] = { images: Math.max(previous.images, value.images), video_seconds: Math.max(previous.video_seconds, value.video_seconds) };
    }
  }
  return { ...Object.fromEntries(Object.entries(output).sort(([a], [b]) => a.localeCompare(b))), updatedAt: new Date(now).toISOString() };
}

export function mergeHourlyReports(local = {}, remote = {}, now = Date.now()) {
  const earliest = now - 48 * 3_600_000;
  const recent = value => timestamp(value) && Date.parse(value) >= earliest && Date.parse(value) <= now;
  const failures = new Map();
  const runs = new Map();
  for (const source of [local, remote]) {
    for (const event of Array.isArray(source?.failureEvents) ? source.failureEvents : []) {
      if (!recent(event?.at) || !ID.test(String(event.matchId ?? '')) || !/^[a-z][a-z-]{0,40}$/.test(event.stage ?? '')) continue;
      const httpStatus = event.httpStatus == null ? null : event.httpStatus;
      if (httpStatus !== null && (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599)) continue;
      const value = { at: new Date(event.at).toISOString(), hourUTC: new Date(event.at).getUTCHours(), stage: event.stage, httpStatus, matchId: event.matchId };
      const key = /^[a-f0-9]{64}$/.test(event.eventId ?? '') ? event.eventId : createHash('sha256').update(JSON.stringify(value)).digest('hex');
      value.eventId = key;
      failures.set(key, value);
    }
    for (const run of Array.isArray(source?.runs) ? source.runs : []) {
      if (!recent(run?.at) || !ID.test(String(run.runId ?? ''))) continue;
      const value = { runId: run.runId, at: new Date(run.at).toISOString(), hourUTC: new Date(run.at).getUTCHours() };
      for (const field of ['eligible', 'pending', 'generated', 'reused', 'completed']) value[field] = Number.isInteger(run[field]) && run[field] >= 0 ? run[field] : 0;
      const previous = runs.get(run.runId);
      if (!previous || Date.parse(value.at) >= Date.parse(previous.at)) runs.set(run.runId, value);
    }
  }
  return { updatedAt: new Date(now).toISOString(), failureEvents: [...failures.values()].sort((a, b) => a.at.localeCompare(b.at)), runs: [...runs.values()].sort((a, b) => a.at.localeCompare(b.at)) };
}
