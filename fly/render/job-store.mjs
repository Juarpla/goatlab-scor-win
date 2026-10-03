import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function jobKey(body) {
  return body.requestId ? `request:${body.chatId}:${body.requestId}` :
    JSON.stringify([String(body.chatId), body.seriesId ?? body.matchId, Number(body.variant ?? 0), body.audioFileId ?? body.audioUrl]);
}

/** One durable record per request. Delivery ambiguity never silently resends a video. */
export class JobStore {
  constructor(dir, { clock = Date.now, ledger } = {}) {
    this.ledger = ledger;
    this.clock = clock;
    this.dir = dir;
    this.jobs = new Map();
    this.byKey = new Map();
    mkdirSync(dir, { recursive: true });
    for (const file of readdirSync(dir).filter(f => /^job-[a-f0-9]+\.json$/.test(f))) {
      const job = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      job.expiresAt ??= (job.createdAt ?? this.clock()) + 86400_000;
      if ((job.retainUntil ?? job.expiresAt) <= this.clock()) { rmSync(join(dir, file), { force: true }); rmSync(join(dir, job.id), { recursive: true, force: true }); continue; }
      this.jobs.set(job.id, job);
      this.byKey.set(job.key, job.id);
      if (job.status === 'working') job.status = 'queued';
      if (job.status === 'delivering') job.status = 'delivery-unknown';
      if (job.cancelled && !['done','delivery-unknown'].includes(job.status)) job.status = 'cancelled';
      this.save(job);
    }
  }

  flush() { return this.ledger?.flush() ?? Promise.resolve(); }

  save(job) {
    const target = join(this.dir, `${job.id}.json`);
    const temp = `${target}.tmp`;
    const fd = openSync(temp, 'w');
    try { writeFileSync(fd, JSON.stringify(job)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, target);
    this.ledger?.save(job);
    const directory = openSync(this.dir, 'r');
    try { fsyncSync(directory); } finally { closeSync(directory); }
  }

  cleanup(protectedIds = new Set()) {
    // A killed atomic write may leave a temporary record; save() is synchronous.
    for (const name of readdirSync(this.dir)) {
      if (/^job-[a-f0-9]+\.json\.tmp$/.test(name)) rmSync(join(this.dir,name),{force:true});
      if (/^job-[a-f0-9]{32}$/.test(name) && !this.jobs.has(name) && !protectedIds.has(name)) rmSync(join(this.dir,name),{recursive:true,force:true});
    }
    for (const job of this.jobs.values()) {
      if ((job.retainUntil ?? job.expiresAt) > this.clock()) continue;
      job.cancelled = true;
      if (protectedIds.has(job.id)) continue;
      rmSync(join(this.dir, job.id), { recursive: true, force: true });
      rmSync(join(this.dir, `${job.id}.json`), { force: true });
      this.jobs.delete(job.id); this.byKey.delete(job.key);
    }
  }

  release(job) {
    if (!['done', 'cancelled'].includes(job.status)) {
      job.retainUntil ??= this.clock() + 86400_000;
      this.save(job); return;
    }
    rmSync(join(this.dir, job.id), { recursive: true, force: true });
    const kept = {};
    for (const key of ['id', 'key', 'chatId', 'matchId', 'requestId', 'variant', 'status', 'cancelled', 'createdAt', 'expiresAt', 'messageId', 'stages', 'audioHash']) kept[key] = job[key];
    kept.retainUntil = job.retainUntil ?? this.clock() + 86400_000;
    for (const key of Object.keys(job)) delete job[key];
    Object.assign(job, kept); this.save(job);
  }

  accept(body) {
    const expiresAt = body.expiresAt ?? this.clock() + 86400_000;
    if (expiresAt <= this.clock()) throw new Error('solicitud caducada');
    const audioHash = createHash('sha256').update(JSON.stringify([body.audioFileId, body.audioUrl])).digest('hex');
    const key = jobKey(body);
    const prior = this.jobs.get(this.byKey.get(key));
    if (prior && prior.status !== 'cancelled' && ((prior.audioHash ?? createHash("sha256").update(JSON.stringify([prior.audioFileId, prior.audioUrl])).digest("hex")) !== audioHash || prior.matchId !== body.matchId))
      throw new Error('requestId ya pertenece a otro audio');
    if (prior && prior.status !== 'error') return { job: prior, duplicate: true };
    const id = prior?.id ?? `job-${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
    const job = { ...body, expiresAt, audioHash, id, key, variant: Number(body.variant ?? 0), status: 'queued', cancelled: false,
      attempts: (prior?.attempts ?? 0) + 1, createdAt: prior?.createdAt ?? this.clock(), stages: {} };
    this.jobs.set(id, job);
    this.byKey.set(key, id);
    this.save(job);
    return { job, duplicate: false };
  }

  cancel(body) {
    const key = jobKey(body);
    let job = this.jobs.get(this.byKey.get(key));
    if (job && ['done', 'cancelled', 'delivering', 'delivery-unknown'].includes(job.status)) return false;
    if (!job) {
      // A cancellation may arrive before a delayed POST /render.
      const id = `job-${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
      job = { id, key, status: 'cancelled', cancelled: true, expiresAt: this.clock() + 86400_000 };
      this.jobs.set(id, job);
      this.byKey.set(key, id);
    }
    job.cancelled = true;
    if (job.status === 'queued') job.status = 'cancelled';
    this.save(job);
    return true;
  }

  directory(job) { const path = join(this.dir, job.id); mkdirSync(path, { recursive: true }); return path; }
  pending() { return [...this.jobs.values()].filter(job => job.status === 'queued' && !job.cancelled); }
}
