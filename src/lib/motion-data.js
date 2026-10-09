/** Resolve chart data from the immutable catalog; never accept model-authored values. */
export const MOTION_KINDS = ['form', 'goals', 'clean-sheets', 'head-to-head', 'synthesis'];
export const MOTION_TITLES = { form: 'FORMA RECIENTE', goals: 'GOLES A FAVOR / RECIBIDOS', 'clean-sheets': 'ARCOS EN CERO', 'head-to-head': 'CARA A CARA', synthesis: 'CLAVES DEL PARTIDO' };
export function resolveMotion(graphic, facts = [], prompts = []) {
  if (!MOTION_KINDS.includes(graphic.kind)) throw new Error('motion desconocido');
  if (!Number.isInteger(graphic.motionPromptNumber) || graphic.motionPromptNumber < 1 || graphic.motionPromptNumber > 30) throw new Error('motionPromptNumber debe ser 1-30');
  const prompt = prompts.find(p => p.n === graphic.motionPromptNumber);
  if (!prompt || prompt.kind !== graphic.kind) throw new Error('Motion Prompt inexistente o incompatible');
  const presentation = graphic.presentation ?? 'statistical';
  if (!['editorial','statistical'].includes(presentation)) throw new Error('presentación de motion desconocida');
  const refs = graphic.factIds ?? [];
  if (presentation === 'editorial') {
    if (!Array.isArray(refs) || refs.length) throw new Error('motion editorial no admite cifras');
    return { presentation, facts: [], title: MOTION_TITLES[graphic.kind], notes: [], contract: promptContract(prompt) };
  }
  if (!Array.isArray(refs) || new Set(refs).size !== refs.length || refs.some(id => !prompt.factIds.includes(id))) throw new Error('hecho ajeno al Motion Prompt');
  const selected = refs.map(id => {
    const fact = facts.find(f => f.id === id);
    if (!fact || !Number.isFinite(fact.value) || fact.value < 0 || !fact.unit || !fact.label || !fact.source) throw new Error('hecho de motion inválido');
    return fact;
  });
  if (graphic.kind !== 'synthesis' && new Set(selected.map(f => f.unit)).size > 1) throw new Error('unidades incompatibles');
  return { presentation, title: MOTION_TITLES[graphic.kind], facts: selected, max: Math.max(1, ...selected.map(f => f.value)), contract: promptContract(prompt),
    notes: [...new Set(selected.map(f => `${f.provider || 'Datos del encuentro'}${Number.isFinite(f.sampleSize) ? ` · muestra: ${f.sampleSize} partidos` : ''}`))] };
}
/** Contrato ejecutable v4 del prompt (beats, easing, background, spring). Defaults si el JSON es v1 legacy. */
export function promptContract(prompt = {}) {
  return {
    beats: Array.isArray(prompt.beats) ? prompt.beats : [],
    easing: prompt.easing ?? { enter: 'ease-out', curve: 'cubic-bezier(0.23,1,0.32,1)', exit: 'ease-out' },
    background: prompt.background ?? { variant: 'carbon-grain', base: '#101412', safeArea: 'left64 right64 top120 bottom480' },
    motion: prompt.motion ?? { spring: { damping: 22, stiffness: 180, mass: 0.6 }, countUp: true, staggerMs: 60, scaleFrom: 0.95 },
    camera: prompt.camera ?? { move: 'push-in 1.0 to 0.9 + drift' },
    transition: prompt.transition ?? { in: 'wipe', out: 'collapse' },
    emphasis_words: Array.isArray(prompt.emphasis_words) ? prompt.emphasis_words : [],
  };
}
