/**
 * Tiempos de un Short: guion alineado con lo oído, tomas de 2 a 4 s,
 * páginas de subtítulo y cifras en el instante en que se dicen.
 * El texto siempre es el del guion; lo oído solo aporta los tiempos.
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

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0 si son la misma palabra, 0.5 si se parecen, 1 si no. */
function substitutionCost(a, b) {
  if (a === b) return 0;
  if (!a || !b) return 1;
  const d = levenshtein(a, b);
  return d <= Math.max(1, Math.floor(Math.max(a.length, b.length) / 3)) ? 0.5 : 1;
}

/**
 * Alinea las palabras del guion con las oídas ({word, start, end}, en
 * segundos desde el inicio de la voz). Devuelve una entrada por palabra del
 * guion. Las que no se oyeron se interpolan entre sus vecinas.
 */
export function alignToScript(narration, heard, durationSeconds) {
  const script = String(narration ?? '').split(/\s+/).filter(Boolean);
  const duration = Number(durationSeconds) > 0 ? Number(durationSeconds) : 0;
  const clean = (heard ?? [])
    .filter(h => h && Number.isFinite(h.start) && Number.isFinite(h.end) && normalizeWord(h.word))
    .sort((x, y) => x.start - y.start);
  if (!script.length || !clean.length) return [];

  const a = script.map(normalizeWord);
  const b = clean.map(h => normalizeWord(h.word));
  const n = a.length;
  const m = b.length;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 1; i <= n; i++) cost[i][0] = i;
  for (let j = 1; j <= m; j++) cost[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cost[i][j] = Math.min(
        cost[i - 1][j - 1] + substitutionCost(a[i - 1], b[j - 1]),
        cost[i - 1][j] + 1,
        cost[i][j - 1] + 1,
      );
    }
  }

  const pairs = new Array(n).fill(null);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (cost[i][j] === cost[i - 1][j - 1] + substitutionCost(a[i - 1], b[j - 1])) {
      pairs[i - 1] = clean[j - 1];
      i--;
      j--;
    } else if (cost[i][j] === cost[i - 1][j] + 1) {
      i--;
    } else {
      j--;
    }
  }

  const end = Math.max(duration, clean.at(-1).end);
  const out = script.map((word, k) => (pairs[k] ? { word, start: pairs[k].start, end: pairs[k].end } : { word }));
  let k = 0;
  while (k < n) {
    if (out[k].start != null) {
      k++;
      continue;
    }
    let g = k;
    while (g < n && out[g].start == null) g++;
    const from = k > 0 ? out[k - 1].end : 0;
    const to = g < n ? out[g].start : end;
    const weights = out.slice(k, g).map(w => Math.max(1, w.word.length));
    const total = weights.reduce((s, x) => s + x, 0);
    let t = from;
    for (let x = k; x < g; x++) {
      const span = (Math.max(0, to - from) * weights[x - k]) / total;
      out[x].start = t;
      out[x].end = t + span;
      t += span;
    }
    k = g;
  }

  let floor = 0;
  return out.map(w => {
    const start = Math.max(floor, w.start);
    const stop = Math.max(start + MIN_WORD, w.end);
    floor = start;
    return { word: w.word, start: round3(start), end: round3(stop) };
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

function heardTokens(heard) {
  const list = Array.isArray(heard)
    ? heard.map(h => (typeof h === 'string' ? h : h?.word))
    : String(heard ?? '').split(/\s+/);
  return list.filter(Boolean).map(raw => {
    const letters = normalizeWord(raw);
    if (WORD_NUM[letters]) return WORD_NUM[letters];
    const digits = String(raw).replace(/[.,](?=\d)/g, '').replace(/\D/g, '');
    return digits || letters;
  });
}

/** Junta «setenta y uno» y «tres coma setenta y uno» en una sola cifra. */
function composeFigures(tokens) {
  const tens = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^[2-9]0$/.test(t) && tokens[i + 1] === 'y' && /^[1-9]$/.test(tokens[i + 2] ?? '')) {
      tens.push(String(Number(t) + Number(tokens[i + 2])));
      i += 2;
      continue;
    }
    tens.push(t);
  }
  const out = [];
  for (let i = 0; i < tens.length; i++) {
    const t = tens[i];
    if (/^\d+$/.test(t) && tens[i + 1] === 'coma' && /^\d+$/.test(tens[i + 2] ?? '')) {
      out.push(t + tens[i + 2]);
      i += 2;
      continue;
    }
    out.push(t);
  }
  return out;
}

function scriptFigures(narration) {
  const seen = [];
  for (const m of String(narration ?? '').matchAll(/\d+(?:[.,]\d+)?/g)) {
    const key = m[0].replace(/[.,]/g, '');
    if (!seen.includes(key)) seen.push(key);
  }
  return seen;
}

function teamsOf(matchLabel) {
  return String(matchLabel ?? '')
    .split(/\s+contra\s+/i)
    .map(side => normalizeWord(side))
    .filter(name => name.length > 2);
}

/**
 * El guion y lo oído coinciden si están los dos equipos y al menos la mitad
 * de las cifras distintas. Lo oído puede venir en palabras («cuatro», «3,71»).
 */
export function anchorsMatch(narration, heard, matchLabel) {
  const tokens = composeFigures(heardTokens(heard));
  const flat = tokens.join('');
  if (teamsOf(matchLabel).some(name => !flat.includes(name))) return false;
  const figs = scriptFigures(narration);
  if (!figs.length) return true;
  const heardFigs = new Set(tokens.filter(t => /^\d+$/.test(t)));
  const hit = figs.filter(f => heardFigs.has(f)).length;
  return hit >= Math.ceil(figs.length / 2);
}

/** Aviso de Telegram si la voz no parece el guion. Null si no hay que avisar. */
export function anchorWarning({ provider, narration, heard, matchLabel, variant }) {
  if (!provider || provider === 'reparto') return null;
  if (anchorsMatch(narration, heard, matchLabel)) return null;
  return `❓ ¿este era el guion ${Number(variant) + 1}?`;
}

/**
 * Hasta `limit` cifras distintas, en el instante en que se dicen.
 * `value` es null si la cifra no admite count-up (por ejemplo `3-0`).
 */
export function figuresFromWords(words, limit = 3) {
  const out = [];
  const seen = new Set();
  for (const w of words ?? []) {
    if (!/\d/.test(w.word)) continue;
    const label = w.word.replace(/^[¿¡("«“]+/, '').replace(/[.,;:?!…"»”)]+$/, '');
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const m = label.match(FIGURE);
    const digits = m?.[2] ?? '';
    const decimals = digits.includes(',') || digits.includes('.') ? digits.split(/[.,]/)[1].length : 0;
    out.push({
      label,
      at: w.start,
      prefix: m ? m[1] : '',
      suffix: m ? m[3] : '',
      value: m ? Number(digits.replace(',', '.')) : null,
      decimals,
      comma: digits.includes(','),
    });
    if (out.length === limit) break;
  }
  return out;
}
