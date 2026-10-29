export const CAPTURE_BUDGET_MS = Number(process.env.CAPTURE_BUDGET_MS || 25 * 60_000);

export function projectCapture({ perFrameMs, frames, workers, calibration = Number(process.env.CAPTURE_CALIBRATION || 1) }) {
  return Math.round(perFrameMs * frames / Math.max(1, workers) * calibration);
}

export function budgetError({ projectedMs, perFrameMs, limitMs = CAPTURE_BUDGET_MS }) {
  if (projectedMs <= limitMs) return null;
  return Object.assign(new Error(`presupuesto de captura: ~${Math.ceil(projectedMs / 60000)} min proyectados (${Math.round(perFrameMs)} ms por fotograma; límite ${Math.round(limitMs / 60000)} min). Reduce efectos costosos en CPU: filter blur o backdrop-filter, sombras grandes, muchas capas o varios videos simultáneos; usa backdrop y focusBlur, que ya vienen desenfocados.`), { code: 'CAPTURE_BUDGET' });
}
