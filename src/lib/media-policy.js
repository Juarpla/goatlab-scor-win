import experiment from './montage-experiment.json' with { type: 'json' };

// Generation and storage capacity are independent of editorial direction.
export const MAX_CLIPS_PER_MATCH = 4;
export function mediaPolicy(matchId, config = experiment) {
  if (!['freedom', 'clips-first'].includes(config.mode) || !(config.matches === null || Array.isArray(config.matches)))
    throw new Error('Configuración de prueba de montaje inválida');
  const clips = config.clips ?? MAX_CLIPS_PER_MATCH;
  if (!Number.isInteger(clips) || clips < 1 || clips > MAX_CLIPS_PER_MATCH) throw new Error('Objetivo de clips inválido');
  const clipsFirst = config.mode === 'clips-first' && (config.matches === null || config.matches.includes(matchId));
  return { mode: clipsFirst ? 'clips-first' : 'freedom', clips };
}
