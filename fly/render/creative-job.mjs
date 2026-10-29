import { createHash } from 'node:crypto';

export const WORKFLOW_PROTOCOL = 3;
export const MAX_CANDIDATES = 2;
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
  if (job.revision >= MAX_CANDIDATES) throw new Error(`se agotó la corrección técnica en ${MAX_CANDIDATES} intentos; conserva el audio para reintentar`);
  validate(input.plan);
  job.revision++;
  job.plan = input.plan;
  job.planHash = planHash;
  job.planModel = input.model;
  job.visualStyle = input.plan.visualStyle;
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
  const unavailable = input.reviewPolicy === 'advisory' && input.reviewStatus === 'unavailable';
  if (unavailable && (!input.reviewError?.trim() || !Array.isArray(input.reviewedFrames) || input.reviewedFrames.length)) throw new Error('revisión no disponible requiere diagnóstico y ningún fotograma revisado');
  if (!unavailable) {
    const frames = input.reviewedFrames;
    if (!Array.isArray(frames)) throw new Error('faltan fotogramas por revisar');
    if (input.reviewPolicy === 'advisory') {
      const unique = new Set(frames);
      if (unique.size !== frames.length || frames.length < Math.min(6, candidate.frames.length) || frames.length > 8 ||
          !frames.every(name => candidate.frames.some(frame => frame.name === name))) throw new Error('muestra de revisión inválida');
    } else if (!candidate.frames.every(frame => frames.includes(frame.name))) throw new Error('faltan fotogramas por revisar');
  }
  if (!input.notes?.trim()) throw new Error('la aprobación requiere observaciones de OpenClaw');
  job.approval = { generation: job.attempts, revision: job.revision, planHash: job.planHash, videoHash: candidate.videoHash,
    notes: input.notes.slice(0, 8000), reviewedFrames: input.reviewedFrames, model: input.model, at: Date.now(),
    reviewPolicy: input.reviewPolicy ?? 'strict', reviewStatus: input.reviewStatus ?? 'completed',
    reviewDecision: input.reviewDecision, reviewError: input.reviewError?.slice(0, 1000) };
  job.operation = 'deliver';
  job.status = 'queued';
  return { duplicate: false };
}

/** A fixed, bounded sample: scene count never increases the cost of review. */
export function reviewTimes(plan, duration, fps = 30) {
  const count = Math.round(duration * fps);
  if (!Number.isFinite(duration) || duration <= 0 || count < 1) throw new Error('duración inválida para muestreo');
  const times = new Set(), content = Math.max(0, duration - 1);
  const add = seconds => times.add(Math.max(0, Math.min(count - 1, Math.round(seconds * fps))));
  for (const second of [.35, content * .18, content * .36, content * .54, content * .72, content - .25, duration - .5, duration - 1 / fps]) add(second);
  for (let i = 0; times.size < Math.min(8, count); i++) add(i * (duration - 1 / fps) / 7);
  return [...times].sort((a, b) => a - b).map(frame => frame / fps);
}
