// Offline report: join the existing per-chat creative memory, metrics and user votes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { VISUAL_STYLES, isVisualStyle } from '../src/lib/visual-style.js';

const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b), i = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2 : null;
};
export function styleReport(memory, { since = 0, limit = 6 } = {}) {
  const items = [...(memory.items || [])].filter(item => item.at >= since && isVisualStyle(item.visualStyle)).sort((a, b) => a.at - b.at).slice(0, limit);
  return { since, requested: limit, samples: items.length, pending: Math.max(0, limit - items.length),
    styles: Object.entries(VISUAL_STYLES).map(([visualStyle, label]) => {
      const group = items.filter(item => item.visualStyle === visualStyle);
      return { visualStyle, label, samples: group.length, liked: group.filter(i => i.rating === 1).length,
        disliked: group.filter(i => i.rating === -1).length, unrated: group.filter(i => ![1, -1].includes(i.rating)).length,
        captureMedianMs: median(group.map(i => i.metrics?.captureMs)),
        renderFramesMedianMs: median(group.map(i => i.metrics?.renderedDoneIn)),
        encodingMedianMs: median(group.map(i => i.metrics?.encodedDoneIn)),
        muxMedianMs: median(group.map(i => i.metrics?.muxMs)),
        authoringMedianMs: median(group.map(i => i.authoringMs)), reviewMedianMs: median(group.map(i => i.reviewMs)),
        reasons: group.filter(i => i.reason).map(i => String(i.reason).slice(0, 500)) };
    }) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
  const input = flag('memory');
  if (!input) throw new Error('falta --memory=<archivo de director-memory de este chat>');
  const since = flag('since') ? Date.parse(flag('since')) : 0;
  if (!Number.isFinite(since)) throw new Error('since requiere una fecha ISO');
  console.log(JSON.stringify(styleReport(JSON.parse(readFileSync(input, 'utf8')), { since }), null, 2));
}
