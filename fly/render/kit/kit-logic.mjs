export function phrases(words, { maxWords = 4, gap = .35 } = {}) {
  const groups = [];
  let current = [];
  for (const word of words || []) {
    const previous = current.at(-1);
    if (current.length && (current.length >= maxWords || word.start - previous.end >= gap)) {
      groups.push(current);
      current = [];
    }
    current.push(word);
  }
  if (current.length) groups.push(current);
  return groups;
}

export function wordAt(words, seconds) {
  return (words || []).findIndex(word => seconds >= word.start && seconds < word.end);
}

export function fitFontSize(text, { maxWidth, max = 120, min = 40, ratio = .55 } = {}) {
  const size = Math.floor(maxWidth / (Math.max(1, String(text ?? '').length) * ratio));
  return Math.max(min, Math.min(max, size));
}
