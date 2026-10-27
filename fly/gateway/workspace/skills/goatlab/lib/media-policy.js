import experiment from './montage-experiment.json' with { type: 'json' };

// Storage accepts the extra resource even after rollback. Admission follows the mode.
export const MAX_CLIPS_PER_MATCH = 3;
export function mediaPolicy(matchId, config = experiment) {
  if (!['freedom', 'clips-first'].includes(config.mode) || !(config.matches === null || Array.isArray(config.matches)))
    throw new Error('Configuración de prueba de montaje inválida');
  const clipsFirst = config.mode === 'clips-first' && (config.matches === null || config.matches.includes(matchId));
  return { mode: clipsFirst ? 'clips-first' : 'freedom', clips: clipsFirst ? 3 : 2 };
}
export function montageDirection(matchId, config = experiment) {
  if (mediaPolicy(matchId, config).mode === 'clips-first') return `Modo de prueba: prioriza los clips animados disponibles como base visual del montaje. Combínalos con imágenes y utiliza gráficos cuando aporten información a la narración. Decide libremente el ritmo, los encuadres y la composición, sin cuotas ni obligación de utilizar todos los clips. Aprovecha recortes y repeticiones con sentido; los clips son ilustraciones generadas con IA, no evidencia del partido. Si no hay clips utilizables, continúa con imágenes y gráficos; si tampoco hay imágenes, compón con gráficos. En notes registra modo clips-first y qué clips utilizaste.`;
  return 'Modo de libertad completa: el inventario es material disponible; elige cualquier subconjunto, repite un recurso si tiene sentido o trabaja solo con gráficos. Decide libremente el ritmo, la composición y el uso de fotos, clips y gráficos.';
}
