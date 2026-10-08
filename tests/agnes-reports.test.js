import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeQuotaReports, mergeHourlyReports } from '../src/lib/agnes-reports.js';
import { exportAgnesReports } from '../scripts/export-agnes-reports.mjs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const now = Date.parse('2026-10-08T20:00:00Z');

test('public quota reports preserve maxima independently by UTC day and discard private fields', () => {
  const result = mergeQuotaReports({ '2026-10-08': { images: 2, video_seconds: 18 }, token: 'private' }, { '2026-10-08': { images: 4, video_seconds: 12, videoId: 'private' }, '2026-10-07': { images: 1, video_seconds: 6 } }, now);
  assert.deepEqual(result, { '2026-10-07': { images: 1, video_seconds: 6 }, '2026-10-08': { images: 4, video_seconds: 18 }, updatedAt: new Date(now).toISOString() });
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('quota rejects invalid days and nonnumeric counters', () => {
  const result = mergeQuotaReports({}, { '2026-02-30': { images: 1, video_seconds: 1 }, '2026-13-01': { images: 1, video_seconds: 1 }, '2026-10-08': { images: true, video_seconds: 1 } }, now);
  assert.deepEqual(result, { updatedAt: new Date(now).toISOString() });
});

test('hourly reports deduplicate, trim to 48h and allowlist fields', () => {
  const event = { at: '2026-10-08T19:00:00Z', stage: 'create', httpStatus: 429, matchId: 'a-b', hourUTC: 5, token: 'private', videoId: 'private', body: 'private' };
  const result = mergeHourlyReports({ failureEvents: [event, { ...event, at: '2026-10-06T19:59:59Z' }] }, { failureEvents: [event, { ...event, at: '2026-10-09T00:00:00Z' }], runs: [{ runId: 'run-1', at: event.at, eligible: 5, pending: 2, generated: 1, completed: 1, token: 'private' }] }, now);
  assert.equal(result.failureEvents.length, 1);
  assert.equal(result.failureEvents[0].hourUTC, 19);
  assert.equal(result.runs[0].eligible, 5);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('stable event IDs preserve separate failures observed in the same second', () => {
  const base = { at: new Date(now).toISOString(), stage: 'create', httpStatus: 429, matchId: 'a-b' };
  const first = { ...base, eventId: 'a'.repeat(64) }, second = { ...base, eventId: 'b'.repeat(64) };
  const merged = mergeHourlyReports({ failureEvents: [first] }, { failureEvents: [first, second] }, now);
  assert.equal(merged.failureEvents.length, 2);
  assert.deepEqual(mergeHourlyReports(merged, merged, now), merged);
});

test('export writes public projections atomically without dumping the authority', async t => {
  const repo = await mkdtemp(join(tmpdir(), 'agnes-report-'));
  t.after(() => rm(repo, { recursive: true, force: true }));
  await exportAgnesReports({ repo, now, report: { quota: { '2026-10-08': { images: 2, video_seconds: 6 } }, slots: { videoId: 'private' }, failureEvents: [] } });
  const quota = await readFile(join(repo, 'public/data/agnes-quota.json'), 'utf8');
  const hourly = await readFile(join(repo, 'public/data/media-pack/_agnes-hourly.json'), 'utf8');
  assert.equal(quota.includes('private') || hourly.includes('private'), false);
  assert.deepEqual(await readdir(join(repo, 'public/data/media-pack')), ['_agnes-hourly.json']);
  await assert.rejects(exportAgnesReports({ repo, report: { slots: {} }, now }));
  assert.equal(await readFile(join(repo, 'public/data/agnes-quota.json'), 'utf8'), quota);
});
