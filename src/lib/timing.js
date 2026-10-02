/**
 * Tiempos de un Short: la transcripción es el texto, tomas de 2 a 4 s,
 * páginas de subtítulo y cifras en el instante en que se dicen.
 */

export const SHOT_MIN = 2;
export const SHOT_MAX = 4;
export const PAGE_WORDS = 3;
const MIN_WORD = 0.06;

export function normalizeWord(word) {
  return String(word ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/** El texto en pantalla es lo que se oyó, con sus tiempos. */
export function cuesFromHeard(heard) {
  const clean = (heard ?? [])
    .filter(h => h && Number.isFinite(h.start) && Number.isFinite(h.end) && String(h.word ?? '').trim())
    .sort((a, b) => a.start - b.start);
  let floor = 0;
  return clean.map(h => {
    const start = Math.max(floor, h.start);
    const end = Math.max(start + MIN_WORD, h.end);
    floor = start;
    return { word: String(h.word).trim(), start: round3(start), end: round3(end) };
  });
}

/** Suma `offset` segundos a cada palabra (la voz entra tarde). */
export function shiftWords(words, offset) {
  return (words ?? []).map(w => ({ ...w, start: round3(w.start + offset), end: round3(w.end + offset) }));
}

const PUNCT_END = /[.,;:?!…]["»”)]*$/;

/**
 * Tomas de SHOT_MIN a SHOT_MAX segundos sobre [0, span]. Corta al final de
 * una frase si cae dentro de la ventana; si no, en la palabra más cercana a
 * 3 s. `photo` rota sobre `photoCount`.
 */
export function planShots(words, span, photoCount) {
  const total = Number(span) > 0 ? Number(span) : 0;
  const count = Math.max(1, photoCount | 0);
  if (total <= SHOT_MIN * 1.5) return [{ start: 0, end: round3(total), photo: 0 }];
  const ends = (words ?? []).map(w => ({ t: w.end, strong: PUNCT_END.test(w.word) }));
  const cuts = [];
  let cursor = 0;
  while (total - cursor > SHOT_MAX) {
    const lo = cursor + SHOT_MIN;
    const hi = cursor + SHOT_MAX;
    const inside = ends.filter(e => e.t >= lo && e.t <= hi && total - e.t >= SHOT_MIN);
    const strong = inside.filter(e => e.strong);
    let cut;
    if (strong.length) cut = strong.at(-1).t;
    else if (inside.length) {
      const target = cursor + (SHOT_MIN + SHOT_MAX) / 2;
      cut = inside.reduce((best, e) => (Math.abs(e.t - target) < Math.abs(best - target) ? e.t : best), inside[0].t);
    } else cut = Math.min(cursor + (SHOT_MIN + SHOT_MAX) / 2, total - SHOT_MIN);
    if (!(cut > cursor)) break;
    cuts.push(cut);
    cursor = cut;
  }
  const bounds = [0, ...cuts, total];
  return bounds.slice(0, -1).map((start, i) => ({
    start: round3(start),
    end: round3(bounds[i + 1]),
    photo: i % count,
  }));
}

/**
 * Páginas de hasta PAGE_WORDS palabras. Una página se cierra en la
 * puntuación. `index` es la posición de la palabra en `words`.
 */
export function captionPages(words, maxWords = PAGE_WORDS) {
  const pages = [];
  let cur = [];
  (words ?? []).forEach((w, index) => {
    cur.push({ ...w, index });
    if (cur.length >= maxWords || PUNCT_END.test(w.word)) {
      pages.push(cur);
      cur = [];
    }
  });
  if (cur.length) pages.push(cur);
  return pages.map((items, i) => {
    const next = pages[i + 1];
    const last = items.at(-1);
    const hold = next ? Math.min(next[0].start, last.end + 0.4) : last.end + 0.4;
    return { start: items[0].start, end: round3(Math.max(last.end, hold)), words: items };
  });
}

const FIGURE = /^([^\d]*?)(\d+(?:[.,]\d+)?)([^\d]*)$/;

const WORD_NUM = {
  cero: '0', uno: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7',
  ocho: '8', nueve: '9', diez: '10', once: '11', doce: '12', trece: '13', catorce: '14',
  quince: '15', dieciseis: '16', diecisiete: '17', dieciocho: '18', diecinueve: '19',
  veinte: '20', veintiuno: '21', veintiun: '21', veintidos: '22', veintitres: '23',
  veinticuatro: '24', veinticinco: '25', veintiseis: '26', veintisiete: '27',
  veintiocho: '28', veintinueve: '29', treinta: '30', cuarenta: '40', cincuenta: '50',
  sesenta: '60', setenta: '70', ochenta: '80', noventa: '90', cien: '100', ciento: '100',
};

/**
 * Hasta `limit` cifras distintas, en el instante en que se dicen.
 * Acepta dígitos y números dichos en español («cuatro»).
 * `value` es null si la cifra no admite count-up (por ejemplo `3-0`).
 */
export function figuresFromWords(words, limit = 3) {
  const out = [];
  const seen = new Set();
  for (const w of words ?? []) {
    const bare = String(w.word ?? '').replace(/^[¿¡("«“]+/, '').replace(/[.,;:?!…"»”)]+$/, '');
    const spoken = WORD_NUM[normalizeWord(bare)];
    const label = spoken || bare;
    if (!spoken && !/\d/.test(label)) continue;
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const m = spoken ? null : label.match(FIGURE);
    const digits = spoken || m?.[2] || '';
    const decimals = !spoken && (digits.includes(',') || digits.includes('.')) ? digits.split(/[.,]/)[1].length : 0;
    out.push({
      label,
      at: w.start,
      prefix: m ? m[1] : '',
      suffix: m ? m[3] : '',
      value: digits ? Number(String(digits).replace(',', '.')) : null,
      decimals,
      comma: !spoken && digits.includes(','),
    });
    if (out.length === limit) break;
  }
  return out;
}
