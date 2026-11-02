/** Resolve chart data from the immutable catalog; never accept model-authored values. */
export const MOTION_KINDS = ['form', 'goals', 'clean-sheets', 'head-to-head', 'synthesis'];
export const MOTION_TITLES = { form: 'FORMA RECIENTE', goals: 'GOLES A FAVOR / RECIBIDOS', 'clean-sheets': 'ARCOS EN CERO', 'head-to-head': 'CARA A CARA', synthesis: 'CLAVES DEL PARTIDO' };
export function resolveMotion(graphic, facts = []) {
  if (!MOTION_KINDS.includes(graphic.kind)) throw new Error('motion desconocido');
  const presentation = graphic.presentation ?? 'statistical';
  if (!['editorial','statistical'].includes(presentation)) throw new Error('presentación de motion desconocida');
  const refs = graphic.factIds ?? [];
  if (presentation === 'editorial') {
    if (!Array.isArray(refs) || refs.length) throw new Error('motion editorial no admite cifras');
    return { presentation, facts: [], title: MOTION_TITLES[graphic.kind], notes: [] };
  }
  if (!Array.isArray(refs)) throw new Error('factIds requiere una lista');
  const selected = refs.map(id => {
    const fact = facts.find(f => f.id === id);
    if (!fact || !Number.isFinite(fact.value) || !fact.unit || !fact.label || !fact.source) throw new Error('hecho de motion inválido');
    return fact;
  });
  return { presentation, title: MOTION_TITLES[graphic.kind], facts: selected, max: Math.max(1, ...selected.map(f => f.value)),
    notes: [...new Set(selected.map(f => `${f.provider || 'Datos del encuentro'}${Number.isFinite(f.sampleSize) ? ` · muestra: ${f.sampleSize} partidos` : ''}`))] };
}
