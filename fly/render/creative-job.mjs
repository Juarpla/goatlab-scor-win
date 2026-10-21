import { createHash } from 'node:crypto';

export const WORKFLOW_PROTOCOL = 3;
export const MAX_CANDIDATES = 3;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(canonical(value))).digest('hex');

function current(job, input) {
  if (job.cancelled || job.status === 'cancelled' || job.expiresAt <= Date.now()) throw new Error('trabajo cancelado o caducado');
  if (job.workflowProtocol !== WORKFLOW_PROTOCOL || input.generation !== job.attempts) throw new Error('generación obsoleta; consulta el contexto actual');
}

/** These transitions run synchronously, before a capture is queued. */
export function submitPlan(job, input, validate) {
  current(job, input);
  const planHash = digest(input.plan);
  if (job.planHash === planHash && input.baseRevision === job.revision - 1) return { duplicate: true };
  if (!['awaiting-plan', 'awaiting-review', 'error'].includes(job.status) || !job.prepared) throw new Error('el trabajo no admite otro plan');
  if (input.baseRevision !== job.revision) throw new Error('revisión obsoleta');
  if (job.revision >= MAX_CANDIDATES) throw new Error('se agotaron las dos correcciones; conserva el audio para reintentar');
  validate(input.plan);
  job.revision++;
  job.plan = input.plan;
  job.planHash = planHash;
  job.planModel = input.model;
  job.candidate = null;
  job.approval = null;
  job.error = null;
  job.errorCode = null;
  job.operation = 'render';
  job.status = 'queued';
  return { duplicate: false };
}

export function approveCandidate(job, input) {
  current(job, input);
  const candidate = job.candidate;
  if (!candidate || input.revision !== job.revision || input.planHash !== job.planHash || input.videoHash !== candidate.videoHash) throw new Error('aprobación de una versión obsoleta');
  if (job.approval) return { duplicate: true };
  if (job.status !== 'awaiting-review') throw new Error('el candidato no está listo para revisión');
  if (!Array.isArray(input.reviewedFrames) || !candidate.frames.every(frame => input.reviewedFrames.includes(frame.name))) throw new Error('faltan fotogramas por revisar');
  if (!input.notes?.trim()) throw new Error('la aprobación requiere observaciones de OpenClaw');
  job.approval = { generation: job.attempts, revision: job.revision, planHash: job.planHash, videoHash: candidate.videoHash,
    notes: input.notes.slice(0, 8000), reviewedFrames: input.reviewedFrames, model: input.model, at: Date.now() };
  job.operation = 'deliver';
  job.status = 'queued';
  return { duplicate: false };
}

/** Include settled scenes, both sides of cuts and the closing card. */
export function reviewTimes(plan, duration, fps = 30) {
  const times = new Set();
  const add = seconds => times.add(Math.max(0, Math.min(Math.round(duration * fps) - 1, Math.round(seconds * fps))));
  for (const scene of plan.scenes) {
    const length = scene.end - scene.start;
    for (const fraction of [.1, .5, .9]) add(scene.start + length * fraction);
    add(scene.start); add(scene.end - 1 / fps);
  }
  // A generated scene list cannot hide long stretches from review.
  if (plan.version === 5) for (let time = 0; time < duration; time += 2) add(time);
  add(duration - 1.5); add(duration - .5); add(duration - 1 / fps);
  return [...times].sort((a, b) => a - b).map(frame => frame / fps);
}
