/** Labeled script contract shared by generation, validation, the site and the renderer. */
export const SCRIPT_BEATS = Object.freeze(['gancho', 'fecha', 'dato', 'picante', 'proyeccion', 'cierre']);
/** What the model writes; GoatLab inserts the `fecha` line from the fixture. */
export const DRAFT_BEATS = Object.freeze(['gancho', 'dato', 'picante', 'proyeccion', 'cierre']);
export const BEAT_LABELS = Object.freeze({
  gancho: 'Gancho',
  fecha: 'Fecha',
  dato: 'Dato',
  picante: 'Picante',
  proyeccion: 'Proyección',
  cierre: 'Cierre',
  guion: 'Guion',
});

const REPEATABLE_BEATS = new Set(['dato', 'picante']);
const REQUIRED_BEATS = new Set(SCRIPT_BEATS);
/** Sanity cap: the pool is a menu of candidates, not an unbounded transcript. */
const MAX_REPEATS = 8;
const MIN_BEAT_WORDS = 6;
const PENINSULAR = /\b(?:vosotros|os|coger|vale|venga|mola|guay|tío|penalti|ábrela)\b/i;
const LIMA = 'America/Lima';
/** Tokens whose period does not end a sentence ("St. James' Park", "EE. UU."). */
const ABBREVIATIONS = new Set([
  'st', 'ee', 'uu', 'sr', 'sra', 'srta', 'dr', 'dra', 'jr', 'mr', 'mrs',
  'lic', 'ing', 'av', 'avda', 'núm', 'num', 'p', 'ej', 'etc', 'vs',
  'cf', 'fc', 'ud', 'sc', 'ac', 'sad',
]);

const words = text => String(text ?? '').split(/\s+/).filter(Boolean).length;

/** Joined text that the voice reads and the validators count. */
export function narrationText(narration) {
  if (Array.isArray(narration)) {
    return narration.map(beat => String(beat?.text ?? '').trim()).filter(Boolean).join(' ');
  }
  return String(narration ?? '').trim();
}

/** Date line spoken in every script, derived from the fixture kickoff. */
export function matchDateSentence(kickoff) {
  const date = new Date(kickoff);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('es-419', {
    timeZone: LIMA, weekday: 'long', day: 'numeric', month: 'long',
  }).formatToParts(date);
  const value = type => parts.find(part => part.type === type)?.value ?? '';
  const weekday = value('weekday').toLowerCase();
  const day = value('day');
  const month = value('month').toLowerCase();
  if (!weekday || !day || !month) return null;
  return `Se juega el ${weekday} ${day} de ${month}.`;
}

/** One sentence per bullet: abbreviations and initials do not open a new one. */
function splitSentences(text) {
  const value = String(text ?? '').trim();
  if (!value) return [];
  const sentences = [];
  let start = 0;
  const boundary = /([.!?…])(\s+)(?=[¿¡"«A-ZÁÉÍÓÚÜÑ])/gu;
  let match;
  while ((match = boundary.exec(value))) {
    const before = value.slice(start, match.index + 1).trim();
    const lastWord = before.replace(/[.!?…]$/, '').split(/\s+/).pop() ?? '';
    const normalized = lastWord.toLowerCase().replace(/[.,]/g, '');
    if (ABBREVIATIONS.has(normalized) || /^[\p{Lu}]$/u.test(lastWord)) continue;
    sentences.push(before);
    start = match.index + match[0].length;
  }
  const tail = value.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

/** Beats for display, numbered when dato or picante repeats. */
export function scriptBeats(narration) {
  const beats = Array.isArray(narration)
    ? narration
      .map(beat => ({ beat: String(beat?.beat ?? '').trim(), text: String(beat?.text ?? '').trim() }))
      .filter(beat => beat.text)
    : (String(narration ?? '').trim() ? [{ beat: 'guion', text: String(narration).trim() }] : []);
  const totals = beats.reduce((counts, beat) => {
    counts[beat.beat] = (counts[beat.beat] ?? 0) + 1;
    return counts;
  }, {});
  const seen = {};
  return beats.map(beat => {
    const base = BEAT_LABELS[beat.beat] ?? 'Guion';
    if (!REPEATABLE_BEATS.has(beat.beat) || totals[beat.beat] < 2) return { ...beat, label: base };
    seen[beat.beat] = (seen[beat.beat] ?? 0) + 1;
    return { ...beat, label: `${base} ${seen[beat.beat]}` };
  });
}

/** Structural errors for an ordered narration. It does not judge content. */
export function beatStructureErrors(narration) {
  if (!Array.isArray(narration)) return ['la narración debe ser una lista de golpes'];
  const beats = narration.map(beat => ({ beat: String(beat?.beat ?? '').trim(), text: String(beat?.text ?? '').trim() }));
  const errors = [];
  const counts = {};
  for (const [index, beat] of beats.entries()) {
    if (!REQUIRED_BEATS.has(beat.beat)) errors.push(`golpe ${index + 1}: etiqueta desconocida (${beat.beat || 'vacía'})`);
    counts[beat.beat] = (counts[beat.beat] ?? 0) + 1;
  }
  for (const name of ['gancho', 'fecha', 'proyeccion', 'cierre']) {
    if (counts[name] !== 1) errors.push(`la narración debe tener un solo golpe ${name}`);
  }
  for (const name of REPEATABLE_BEATS) {
    if (!counts[name]) errors.push(`la narración debe tener al menos un golpe ${name}`);
    if ((counts[name] ?? 0) > MAX_REPEATS) errors.push(`máximo ${MAX_REPEATS} golpes ${name}`);
  }
  const expected = [
    'gancho', 'fecha',
    ...Array(counts.dato ?? 0).fill('dato'),
    ...Array(counts.picante ?? 0).fill('picante'),
    'proyeccion', 'cierre',
  ];
  for (let index = 0; index < Math.max(expected.length, beats.length); index += 1) {
    if (expected[index] !== beats[index]?.beat) {
      errors.push(`golpe ${index + 1}: se esperaba ${expected[index] ?? 'nada'} y llegó ${beats[index]?.beat ?? 'nada'}`);
    }
  }
  for (const [index, beat] of beats.entries()) {
    const label = `golpe ${index + 1} (${beat.beat || 'sin etiqueta'})`;
    if (!beat.text) {
      errors.push(`${label}: texto vacío`);
      continue;
    }
    const count = words(beat.text);
    if (!/[.!?]$/.test(beat.text)) errors.push(`${label}: la frase no cierra con . ? o !`);
    if (REPEATABLE_BEATS.has(beat.beat) && splitSentences(beat.text).length > 1) errors.push(`${label}: una sola frase por golpe`);
    if (beat.beat === 'gancho' && (count < 4 || count > 14)) errors.push(`${label}: ${count} palabras, rango 4–14`);
    if (beat.beat === 'fecha' && (count < 4 || count > 12)) errors.push(`${label}: ${count} palabras, rango 4–12`);
    if (beat.beat === 'cierre' && (count < 3 || count > 14)) errors.push(`${label}: ${count} palabras, rango 3–14`);
    if (beat.beat === 'cierre' && PENINSULAR.test(beat.text)) errors.push(`${label}: usa español latinoamericano, no peninsular`);
    if (REPEATABLE_BEATS.has(beat.beat) && count < MIN_BEAT_WORDS) errors.push(`${label}: ${count} palabras, mínimo ${MIN_BEAT_WORDS}`);
  }
  return errors;
}
