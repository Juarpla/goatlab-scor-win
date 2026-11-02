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

export function cameraAt(frame, { from = {}, to = {}, durationInFrames = 1, startFrame = 0 } = {}) {
  const t = Math.max(0, Math.min(1, (frame - startFrame) / Math.max(1, durationInFrames - 1)));
  const mix = t * t * (3 - 2 * t);
  const axis = (name, fallback) => (from[name] ?? fallback) + ((to[name] ?? fallback) - (from[name] ?? fallback)) * mix;
  return { scale: Math.max(.01, axis('scale', 1)), x: axis('x', 0), y: axis('y', 0) };
}

export function grainPosition(frame, seed = 0) {
  const step = Math.floor(frame / 2);
  return { x: ((Math.imul(step + (seed | 0), 17) % 64) + 64) % 64, y: ((Math.imul(step + (seed | 0), 29) % 64) + 64) % 64 };
}
