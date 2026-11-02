// Aligns script text with Mistral timings. The voice owns the
// timings; the script fixes names, figures and punctuation for subtitles.
const NUMBER_WORDS = {
  cero: '0', uno: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7',
  ocho: '8', nueve: '9', diez: '10', once: '11', doce: '12', trece: '13', catorce: '14',
  quince: '15', dieciseis: '16', diecisiete: '17', dieciocho: '18', diecinueve: '19',
  veinte: '20', veintiuno: '21', veintiun: '21', veintidos: '22', veintitres: '23',
  veinticuatro: '24', veinticinco: '25', veintiseis: '26', veintisiete: '27',
  veintiocho: '28', veintinueve: '29', treinta: '30', cuarenta: '40', cincuenta: '50',
  sesenta: '60', setenta: '70', ochenta: '80', noventa: '90', cien: '100', ciento: '100',
};

const STOPWORDS = new Set([
  'a', 'al', 'la', 'el', 'los', 'las', 'de', 'del', 'que', 'y', 'o', 'u', 'en', 'un', 'una',
  'por', 'para', 'con', 'se', 'su', 'lo', 'le', 'es', 'son', 'ha', 'han', 'mas', 'pero',
  'como', 'si', 'no', 'mi', 'me', 'te', 'nos', 'les',
]);

export function normalizeWord(word) {
  return String(word ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function canonical(word) {
  const normalized = normalizeWord(word);
  return NUMBER_WORDS[normalized] ?? normalized.replace(',', '.');
}

const round3 = n => Math.round(n * 1000) / 1000;

/**
 * Returns one script word per token, with the `heard` timings.
 * `score` is the fraction of tokens that matched exactly.
 */
export function alignReference(heard, reference, voiceSeconds) {
  const ref = String(reference ?? '').trim().split(/\s+/).filter(Boolean);
  const heardWords = (heard ?? [])
    .filter(w => w && Number.isFinite(w.start) && Number.isFinite(w.end) && String(w.word ?? '').trim())
    .sort((a, b) => a.start - b.start);
  if (!ref.length || !heardWords.length) return { words: heardWords, score: 0 };

  const n = ref.length, m = heardWords.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const same = canonical(ref[i - 1]) === canonical(heardWords[j - 1].word);
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (same ? 0 : 1));
    }
  }

  const pairs = new Map();
  let i = n, j = m, matches = 0;
  while (i > 0 && j > 0) {
    const same = canonical(ref[i - 1]) === canonical(heardWords[j - 1].word);
    if (dp[i][j] === dp[i - 1][j - 1] + (same ? 0 : 1)) {
      pairs.set(i - 1, j - 1);
      if (same) matches++;
      i--; j--;
    } else if (dp[i][j] === dp[i - 1][j] + 1) i--;
    else j--;
  }

  const times = new Array(n).fill(null);
  for (const [ri, hi] of pairs) times[ri] = { start: heardWords[hi].start, end: heardWords[hi].end };
  // A name Mistral splits into several words keeps the full span.
  const ordered = [...pairs.entries()].sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < ordered.length; k++) {
    const [ri, hi] = ordered[k];
    const prevHi = ordered[k - 1][1];
    if (hi - prevHi <= 1) continue;
    const gap = heardWords.slice(prevHi + 1, hi);
    if (gap.every(w => STOPWORDS.has(normalizeWord(w.word)))) {
      times[ri].start = Math.min(times[ri].start, gap[0].start);
    }
  }
  // Unmatched script words split the gap between neighbors.
  for (let r = 0; r < n; r++) {
    if (times[r]) continue;
    let p = r - 1;
    while (p >= 0 && !times[p]) p--;
    let q = r + 1;
    while (q < n && !times[q]) q++;
    const prevEnd = p >= 0 ? times[p].end : 0;
    const nextStart = q < n ? times[q].start : voiceSeconds;
    const count = q - p - 1;
    const slot = Math.max(0.06, (nextStart - prevEnd) / Math.max(1, count));
    for (let k = 0; k < count; k++) {
      const index = p + 1 + k;
      if (times[index]) continue;
      const start = prevEnd + slot * k;
      times[index] = { start, end: Math.min(nextStart, start + slot) };
    }
  }

  let floor = 0;
  const words = ref.map((word, index) => {
    const t = times[index] ?? { start: floor, end: floor + 0.06 };
    const start = Math.max(floor, Math.min(voiceSeconds, t.start));
    const end = Math.max(start + 0.06, Math.min(voiceSeconds, t.end));
    floor = start;
    return { word, start: round3(start), end: round3(end) };
  });
  return { words, score: matches / n };
}

/** Chooses the script that best aligns with what was heard; null if there are no candidates. */
export function alignScripts(heard, scripts, voiceSeconds) {
  const rows = (scripts ?? [])
    .filter(script => Number.isInteger(script?.n) && typeof script.narration === 'string' && script.narration.trim())
    .map(script => ({ n: script.n, ...alignReference(heard, script.narration, voiceSeconds) }));
  rows.sort((a, b) => b.score - a.score || a.n - b.n);
  return rows[0] ?? null;
}
