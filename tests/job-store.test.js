import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobStore } from '../fly/render/job-store.mjs';
const body = { chatId: '1', matchId: 'match', requestId: 'stable', audioFileId: 'voice', assets: [] };

test('queued and interrupted jobs survive restart; repeated POST is idempotent', t => {
  const dir = mkdtempSync(join(tmpdir(), 'goatlab-jobs-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let store = new JobStore(dir);
  const { job } = store.accept(body);
  job.status = 'working'; store.save(job);
  store = new JobStore(dir);
  assert.equal(store.pending()[0].id, job.id);
  assert.equal(store.accept(body).duplicate, true);
  store.jobs.get(job.id).status = 'done'; store.save(store.jobs.get(job.id));
  assert.equal(new JobStore(dir).accept(body).job.status, 'done');
});

test('cancellation wins even if it arrives before POST, and delivery ambiguity is retained', t => {
  const dir = mkdtempSync(join(tmpdir(), 'goatlab-jobs-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let store = new JobStore(dir);
  store.cancel(body);
  store = new JobStore(dir);
  assert.equal(store.accept(body).job.status, 'cancelled');
  const { job } = store.accept({ ...body, requestId: 'second' });
  job.status = 'delivering'; store.save(job);
  store = new JobStore(dir);
  assert.equal(store.jobs.get(job.id).status, 'delivery-unknown');
  assert.equal(store.accept({ ...body, requestId: 'second' }).duplicate, true);
});

test('confirmed delivery removes artifacts, keeps duplicate marker and expires without accumulating records', t => {
  const dir = mkdtempSync(join(tmpdir(), 'goatlab-gc-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let now = 1000;
  const store = new JobStore(dir, { clock: () => now });
  for (let i=0; i<50; i++) {
    const request = { ...body, requestId: String(i), expiresAt: now+1000 };
    const { job } = store.accept(request);
    const artifacts = store.directory(job);
    writeFileSync(join(artifacts, 'voice.ogg'), 'temporary audio');
    writeFileSync(join(artifacts, 'short.mp4'), 'temporary video');
    job.status = 'done'; store.release(job);
    assert.equal(job.audioFileId, undefined);
    assert.equal(existsSync(artifacts), false);
    assert.equal(store.accept(request).duplicate, true);
  }
  now += 86400_001;
  store.cleanup();
  assert.equal(store.jobs.size, 0); assert.equal(store.byKey.size, 0);
  assert.throws(() => store.accept({ ...body, expiresAt: 2000 }), /caducada/);
});

test('expiration protects active files until their worker exits', t => {
  const dir = mkdtempSync(join(tmpdir(), 'goatlab-inuse-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let now = 1000;
  const store = new JobStore(dir, { clock: () => now });
  const {job} = store.accept({...body,expiresAt:2000});
  const artifacts = store.directory(job);
  job.status='working'; now=2001;
  store.cleanup(new Set([job.id]));
  assert.ok(existsSync(artifacts)); assert.ok(job.cancelled);
  store.cleanup(); assert.equal(existsSync(artifacts),false); assert.equal(store.jobs.size,0);
});
