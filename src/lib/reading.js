/**
 * La lectura: normalización de las secciones LLM para la pizarra del analista.
 *
 * Acepta los tres formatos guardados en `llm-analysis.json` (párrafo legacy,
 * secciones v2 sin `kind`/`stats`, secciones v3 con ambos) y devuelve una
 * forma estable para la vista. Las cifras protagonistas solo se aceptan si
 * aparecen literalmente en los bullets de su sección: la pizarra nunca
 * escribe un número que el texto no diga.
 */

/** Tipos de sección que la pizarra sabe dibujar. */
export const READING_KINDS = ['panorama', 'modelos', 'historial', 'tabla', 'goleadores', 'forma', 'claves'];

/* Pistas para elegir escena en secciones v2 (solo decoración, jamás cifras).
   Decide el título y nada más: los bullets suelen mencionar de pasada el
   historial o los puntos, y esas palabras convertían dos secciones distintas
   en la misma escena. `goleadores` va antes que `tabla`: la tabla de
   artilleros vuelve al podio y la clasificación usa la rejilla. */
const TITLE_HINTS = [
  ['modelos', /modelo|poisson|catboost|probabilidad|porcentaje|reparte|favorit|calculo|cálculo/i],
  ['historial', /historial|cara a cara|\bcruces?\b|precedentes?|h2h|se han visto|duelos directos/i],
  ['goleadores', /goleador|artiller|pichichi|máximo anotador|maximo anotador/i],
  ['tabla', /\btabla\b|clasificaci|posici[oó]n|\bpuesto\b|\bpuntos\b/i],
  ['forma', /\bforma\b|racha|resultado|reciente|momento|bache|victorias|derrotas|empates|arrastra/i],
  ['claves', /clave|contexto|nota|límite|limite|duda|ausencia|baja|sede|clima|árbitro|arbitro|descanso/i],
];

/** Elige escena por título cuando el JSON no declara `kind`. */
export function inferKind(title = '') {
  for (const [kind, pattern] of TITLE_HINTS) {
    if (pattern.test(title)) return kind;
  }
  return 'panorama';
}

/** Decimales en coma latina para toda cifra que la vista imprime. */
export function formatFigure(value) {
  return String(value ?? '').replace(/(\d)\.(\d)/g, '$1,$2');
}

const normalize = value => String(value ?? '').replace(/,/g, '.');

/** Sanea hasta 3 cifras: forma válida y presencia literal en los bullets. */
function normalizeStats(stats, bullets) {
  if (!Array.isArray(stats)) return [];
  return stats
    .filter(stat => stat && typeof stat.value === 'string' && stat.value.trim() && stat.value.trim().length <= 12)
    .filter(stat => typeof stat.label === 'string' && stat.label.trim() && stat.label.trim().length <= 28)
    .map(stat => ({ value: stat.value.trim(), label: stat.label.trim() }))
    .filter(stat => bullets.some(bullet => normalize(bullet).includes(normalize(stat.value))))
    .slice(0, 3);
}

/**
 * Normaliza una entrada de `llm-analysis.json` (o null). Devuelve
 * `{ sections }` o null si no hay nada que mostrar. La auditoría del LLM
 * (`limitations`) se queda en el JSON: la vista no la imprime nunca.
 */
export function normalizeReading(entry) {
  if (!entry) return null;
  const sections = [];
  if (Array.isArray(entry.summary)) {
    for (const section of entry.summary) {
      if (!section || typeof section.title !== 'string' || !Array.isArray(section.bullets)) continue;
      const bullets = section.bullets.filter(bullet => typeof bullet === 'string' && bullet.trim()).slice(0, 4);
      if (!bullets.length) continue;
      const title = section.title.trim();
      sections.push({
        title,
        kind: READING_KINDS.includes(section.kind) ? section.kind : inferKind(title),
        stats: normalizeStats(section.stats, bullets),
        bullets,
      });
    }
  } else if (typeof entry.summary === 'string' && entry.summary.trim()) {
    sections.push({ title: '', kind: 'panorama', stats: [], bullets: [entry.summary.trim()] });
  }
  if (!sections.length) return null;
  return { sections: sections.slice(0, 5) };
}

/**
 * Parte un bullet en segmentos, marcando las cifras declaradas. Solo hay
 * coincidencia literal (con coma o punto intercambiables); ningún número
 * suelto del texto se resalta por su cuenta.
 */
export function matchFigures(text, stats) {
  const source = String(text ?? '');
  if (!source || !Array.isArray(stats) || !stats.length) return [{ text: source }];
  const haystack = normalize(source);
  const ranges = [];
  for (const stat of stats) {
    const needle = normalize(stat?.value);
    if (!needle) continue;
    let from = 0;
    while (from <= haystack.length - needle.length) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      ranges.push({ start: at, end: at + needle.length });
      from = at + needle.length;
    }
  }
  if (!ranges.length) return [{ text: source }];
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start < last.end) {
      last.end = Math.max(last.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }
  const parts = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) parts.push({ text: source.slice(cursor, range.start) });
    parts.push({ text: formatFigure(source.slice(range.start, range.end)), figure: true });
    cursor = range.end;
  }
  if (cursor < source.length) parts.push({ text: source.slice(cursor) });
  return parts;
}
