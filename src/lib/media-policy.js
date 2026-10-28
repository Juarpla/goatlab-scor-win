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
export function montageDirection(matchId, config = experiment) {
  const mode = mediaPolicy(matchId, config).mode;
  const direction = 'Usa los clips y las imágenes disponibles como base visual protagonista del montaje. Los gráficos, títulos y datos son apoyo de la narración y mantienen visible y reconocible el material. Conserva libertad creativa en ritmo, encuadres, recortes, transiciones, efectos, composición y edición de fotos y clips, sin porcentajes ni obligación de utilizar todos los recursos. Selecciona y combina el material según la voz; puedes repetirlo con sentido. Con un banco parcial, aprovecha los recursos utilizables; si solo hay fotos o solo clips, construye el montaje con ellos. Solo si no hay imágenes ni clips utilizables, compón con gráficos y explica esa ausencia en notes. La media generada con IA ilustra, no demuestra hechos del partido. En notes identifica las fotos y los clips utilizados por su índice y explica cualquier limitación técnica encontrada.';
  return (mode === 'clips-first'
    ? 'Modo de prueba clips-first: prioriza los clips animados dentro de esta dirección. '
    : 'Modo de libertad creativa con protagonismo de imágenes y clips. ') + direction;
}
