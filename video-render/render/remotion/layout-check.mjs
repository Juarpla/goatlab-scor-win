export const SAFE_BOTTOM = 320;
export const SAFE_RIGHT = 140;

const outside = (item, width, height) => {
  const area = Math.max(1, item.w * item.h);
  const overlapW = Math.max(0, Math.min(item.x + item.w, width) - Math.max(item.x, 0));
  const overlapH = Math.max(0, Math.min(item.y + item.h, height) - Math.max(item.y, 0));
  return (area - overlapW * overlapH) / area > .15;
};

/** Severe findings repeat or sit on the middle sample, so entrances and exits stay legal. */
export function classifyLayout(probes, { width = 1080, height = 1920 } = {}) {
  const frames = probes.map(probe => probe.frame);
  const middle = frames[Math.floor(frames.length / 2)];
  const grouped = new Map();
  for (const probe of probes) for (const item of probe.items || []) {
    if (!item.visible || !item.text) continue;
    const list = grouped.get(item.text) || [];
    list.push({ ...item, frame: probe.frame });
    grouped.set(item.text, list);
  }
  const severe = [], minor = [];
  for (const [text, items] of grouped) {
    const broken = items.filter(item => item.clipped || outside(item, width, height));
    if (broken.length >= 2 || broken.some(item => item.frame === middle)) severe.push({ text, frame: broken[0].frame });
    for (const item of items) {
      if (item.fontSize > 0 && item.fontSize < 40) minor.push({ text, kind: 'size', fontSize: item.fontSize });
      if (item.y + item.h > height - SAFE_BOTTOM) minor.push({ text, kind: 'bottom' });
      if (item.x + item.w > width - SAFE_RIGHT && item.y > 700) minor.push({ text, kind: 'right' });
    }
  }
  return { severe, minor };
}

export function layoutMessages(layout) {
  return [
    ...layout.severe.map(item => `texto recortado "${item.text}"`),
    ...layout.minor.map(item => item.kind === 'size' ? `tamaño ${Math.round(item.fontSize)}px en "${item.text}"` : `zona ${item.kind}: "${item.text}"`),
  ].slice(0, 12);
}
