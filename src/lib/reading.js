/**
 * The reading: normalization of LLM sections for the analyst board.
 *
 * Accepts the three formats stored in `llm-analysis.json` (legacy paragraph,
 * v2 sections without `kind`/`stats`, v3 sections with both) and returns a
 * stable shape for the view. Protagonist figures are only accepted if
 * they appear literally in their section's bullets: the board never
 * writes a number the text does not state.
 */

/** Section types the board can draw. */
export const READING_KINDS = ['panorama', 'modelos', 'historial', 'tabla', 'goleadores', 'forma', 'claves'];

/* Hints for choosing a scene in v2 sections (decoration only, never figures).
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

/** Chooses a scene by title when the JSON does not declare `kind`. */
export function inferKind(title = '') {
  for (const [kind, pattern] of TITLE_HINTS) {
    if (pattern.test(title)) return kind;
  }
  return 'panorama';
}

/** Latin decimal comma for every figure the view prints. */
export function formatFigure(value) {
  return String(value ?? '').replace(/(\d)\.(\d)/g, '$1,$2');
}

const normalize = value => String(value ?? '').replace(/,/g, '.');

/** Sanitizes up to 3 figures: valid shape and literal presence in the bullets. */
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
 * Normalizes an entry from `llm-analysis.json` (or null). Returns
 * `{ sections }` or null if there is nothing to show. The LLM audit
 * (`limitations`) stays in the JSON: the view never prints it.
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
 * Splits a bullet into segments, marking declared figures. Only literal
 * matching (comma or dot interchangeable); no loose number in the text
 * is highlighted on its own.
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
