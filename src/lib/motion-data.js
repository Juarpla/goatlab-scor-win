/** Resolve chart data from the immutable catalog; never accept model-authored values. */
export const MOTION_KINDS = ['form', 'goals', 'clean-sheets', 'head-to-head', 'synthesis'];
export const MOTION_TITLES = { form: 'FORMA RECIENTE', goals: 'GOLES A FAVOR / RECIBIDOS', 'clean-sheets': 'ARCOS EN CERO', 'head-to-head': 'CARA A CARA', synthesis: 'CLAVES DEL PARTIDO' };
export function resolveMotion(graphic, facts = [], prompts = []) {
  if (!MOTION_KINDS.includes(graphic.kind)) throw new Error('motion desconocido');
  const prompt = prompts.find(p => p.n === graphic.motionPromptNumber);
  if (!prompt || prompt.kind !== graphic.kind) throw new Error('Motion Prompt inexistente o incompatible');
  const refs = graphic.factIds ?? [];
  if (!Array.isArray(refs) || new Set(refs).size !== refs.length || refs.some(id => !prompt.factIds.includes(id))) throw new Error('hecho ajeno al Motion Prompt');
  const selected = refs.map(id => {
    const fact = facts.find(f => f.id === id);
    if (!fact || !Number.isFinite(fact.value) || fact.value < 0 || !fact.unit || !fact.label || !fact.source) throw new Error('hecho de motion inválido');
    return fact;
  });
  if (graphic.kind !== 'synthesis' && new Set(selected.map(f => f.unit)).size > 1) throw new Error('unidades incompatibles');
  return { title: MOTION_TITLES[graphic.kind], facts: selected, max: Math.max(1, ...selected.map(f => f.value)),
    notes: [...new Set(selected.map(f => `${f.provider || 'Datos del encuentro'}${Number.isFinite(f.sampleSize) ? ` · muestra: ${f.sampleSize} partidos` : ''}`))] };
}
