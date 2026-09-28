/**
 * Plantilla fija GoatLab para HyperFrames (heygen-com/hyperframes).
 * HTML + GSAP: tomas de 2 a 4 s con transición, recorridos de cámara,
 * subtítulo por palabra, cifras con count-up y rótulo del jugador.
 * Solo CSS y GSAP: sin WebGL, que en la CPU compartida de Fly es lento.
 */
import { CAMERA_MOVES } from './media.js';
import { planShots, captionPages, figuresFromWords } from './timing.js';

export const FRAME_W = 1080;
export const FRAME_H = 1920;
export const ENDCARD_SECONDS = 3;
export const CAPTION_FILL = '#ffe14a';
export const CAPTION_EDGE = '#000';
export const TRANSITION_SECONDS = 0.25;
const FIGURE_HOLD = 2.4;
const TAG_HOLD = 2.2;
const PUNCH_SCALE = 1.08;

const CAMERA = {
  'pan-left': { from: 'x: 70, y: 0, scale: 1.08, rotation: 0', to: 'x: -70, y: 10, scale: 1.12, rotation: 0' },
  'pan-right': { from: 'x: -70, y: 0, scale: 1.08, rotation: 0', to: 'x: 70, y: -10, scale: 1.12, rotation: 0' },
  push: { from: 'x: 0, y: 0, scale: 1.02, rotation: 0', to: 'x: 0, y: -12, scale: 1.2, rotation: 0' },
  pull: { from: 'x: 0, y: 0, scale: 1.22, rotation: 0', to: 'x: 8, y: 8, scale: 1.05, rotation: 0' },
  tilt: { from: 'x: 20, y: 10, scale: 1.14, rotation: -2.2', to: 'x: -16, y: -8, scale: 1.16, rotation: 2.2' },
  rise: { from: 'x: 0, y: 60, scale: 1.12, rotation: 0', to: 'x: 0, y: -50, scale: 1.16, rotation: 0' },
  drift: { from: 'x: -40, y: 30, scale: 1.1, rotation: -0.6', to: 'x: 46, y: -24, scale: 1.16, rotation: 0.8' },
  'cut-in': { from: 'x: 24, y: 16, scale: 1.28, rotation: 0', to: 'x: -8, y: -6, scale: 1.3, rotation: 0' },
  slide: { from: 'x: 120, y: 0, scale: 1.12, rotation: 0', to: 'x: -20, y: 0, scale: 1.14, rotation: 0' },
  'hold-push': { from: 'x: 0, y: 0, scale: 1.06, rotation: 0', to: 'x: -18, y: 14, scale: 1.14, rotation: 0.4' },
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Reparte el guion sobre la duración de la voz. Solo si no hay tiempos reales. */
export function alignWords(narration, durationSeconds) {
  const words = String(narration ?? '').split(/\s+/).filter(Boolean);
  const duration = Number(durationSeconds);
  if (!words.length || !(duration > 0)) return [];
  const weights = words.map(word => Math.max(1, word.length));
  const total = weights.reduce((sum, n) => sum + n, 0);
  let t = 0;
  return words.map((word, i) => {
    const span = (weights[i] / total) * duration;
    const cue = { word, start: round3(t), end: round3(t + span) };
    t += span;
    return cue;
  });
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/** Hasta tres cifras distintas, en el orden en que se dicen. */
export function figuresFromNarration(narration, limit = 3) {
  const out = [];
  const seen = new Set();
  for (const match of String(narration ?? '').matchAll(/\d+(?:[.,]\d+)?/g)) {
    const label = match[0];
    if (seen.has(label)) continue;
    seen.add(label);
    const value = Number(label.replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    out.push({ label, value });
    if (out.length === limit) break;
  }
  return out;
}

export function cameraMove(name) {
  return CAMERA[name] ?? CAMERA.push;
}

/** La primera toma entra con `cut-in`; las demás rotan desde `camera`. */
export function shotMoves(count, camera = 'push') {
  const base = Math.max(0, CAMERA_MOVES.indexOf(camera));
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? 'cut-in' : CAMERA_MOVES[(base + i - 1) % CAMERA_MOVES.length],
  );
}

function figureText(fig, v) {
  if (fig.value == null) return fig.label;
  const n = v.toFixed(fig.decimals ?? 0);
  return `${fig.prefix ?? ''}${fig.comma ? n.replace('.', ',') : n}${fig.suffix ?? ''}`;
}

/**
 * HTML de una composición. `photos` son {src, subject?} con rutas relativas.
 * `words` ya vienen en tiempo de composición. `duration` incluye la end card.
 */
export function buildComposition({
  duration,
  photos,
  camera = 'push',
  words = [],
  figures,
  match = '',
  brand = 'goatlab.win',
}) {
  const total = round3(Math.max(ENDCARD_SECONDS + 1, Number(duration) || 0));
  const photoSpan = round3(total - ENDCARD_SECONDS);
  const frames = (photos ?? []).filter(p => p?.src);
  const spoken = words.filter(w => w.start < photoSpan);
  const shots = frames.length ? planShots(spoken, photoSpan, frames.length) : [];
  const moves = shotMoves(shots.length, CAMERA_MOVES.includes(camera) ? camera : 'push');
  const figs = (figures ?? figuresFromWords(spoken)).filter(f => Number.isFinite(f.at) && f.at < photoSpan - 0.3);
  let track = 0;
  const html = [];
  const js = [];

  shots.forEach((shot, i) => {
    const last = i === shots.length - 1;
    const dur = round3(shot.end - shot.start + (last ? 0 : TRANSITION_SECONDS));
    const move = cameraMove(moves[i]);
    html.push(
      `<div id="shot${i}" class="shot clip" data-start="${shot.start}" data-duration="${dur}" data-track-index="${track++}">` +
      `<img id="img${i}" src="${esc(frames[shot.photo].src)}" alt="" /></div>`,
    );
    js.push(`tl.fromTo("#img${i}", { ${move.from} }, { ${move.to}, duration: ${dur}, ease: "none" }, ${shot.start});`);
    if (i > 0) {
      js.push(`tl.fromTo("#shot${i}", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: ${TRANSITION_SECONDS}, ease: "power2.out" }, ${shot.start});`);
    }
  });

  const flashes = [];
  figs.forEach(fig => {
    const active = shots.findIndex(s => fig.at >= s.start && fig.at < s.end);
    if (active >= 0) {
      js.push(`tl.to("#shot${active}", { scale: ${PUNCH_SCALE}, duration: 0.3, ease: "power2.out" }, ${round3(fig.at)});`);
    }
    const cut = shots.slice(1).map(s => s.start).find(t => Math.abs(t - fig.at) <= 1);
    if (cut != null && !flashes.includes(cut)) flashes.push(cut);
  });
  if (flashes.length) {
    html.push(`<div id="flash" class="flash clip" data-start="0" data-duration="${photoSpan}" data-track-index="${track++}"></div>`);
    for (const t of flashes) {
      js.push(`tl.fromTo("#flash", { opacity: 0 }, { opacity: 0.85, duration: 0.08, ease: "power4.in" }, ${round3(Math.max(0, t - 0.08))});`);
      js.push(`tl.to("#flash", { opacity: 0, duration: 0.17, ease: "power4.out" }, ${round3(t)});`);
      js.push(`tl.set("#flash", { opacity: 0 }, ${round3(t + 0.17)});`);
    }
  }

  const seen = new Set();
  shots.forEach((shot, i) => {
    const subject = String(frames[shot.photo].subject ?? '').trim();
    if (!subject || seen.has(subject)) return;
    seen.add(subject);
    const start = round3(shot.start + 0.15);
    const dur = round3(Math.min(TAG_HOLD, shot.end - start));
    if (dur < 0.8) return;
    html.push(
      `<div id="tag${i}" class="tag clip" data-start="${start}" data-duration="${dur}" data-track-index="${track++}">` +
      `<span class="tag-bar"></span><span class="tag-name">${esc(subject)}</span></div>`,
    );
    js.push(`tl.fromTo("#tag${i}", { opacity: 0, x: -80 }, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out" }, ${start});`);
  });

  figs.forEach((fig, i) => {
    const next = figs[i + 1]?.at ?? photoSpan;
    const start = round3(fig.at);
    const dur = round3(Math.max(0.5, Math.min(FIGURE_HOLD, next - fig.at, photoSpan - fig.at)));
    html.push(
      `<div id="f${i}" class="fig clip" data-start="${start}" data-duration="${dur}" data-track-index="${track++}">${esc(figureText(fig, 0))}</div>`,
    );
    js.push(`tl.fromTo("#f${i}", { opacity: 0, y: 36, scale: 0.86 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "power3.out" }, ${start});`);
    if (fig.value != null && fig.value > 0) {
      const spec = JSON.stringify({ prefix: fig.prefix ?? '', suffix: fig.suffix ?? '', decimals: fig.decimals ?? 0, comma: !!fig.comma });
      js.push(
        `(function () { var c = { v: 0 }, s = ${spec}, el = document.getElementById("f${i}");` +
        ` tl.to(c, { v: ${fig.value}, duration: 0.6, ease: "power2.out", onUpdate: function () { el.textContent = fmt(c.v, s); } }, ${start}); })();`,
      );
    }
  });

  captionPages(spoken).forEach((page, p) => {
    const dur = round3(Math.max(0.2, Math.min(page.end, photoSpan) - page.start));
    const spans = page.words.map(w => `<span class="word" id="w${w.index}">${esc(w.word)}</span>`).join(' ');
    html.push(`<div id="page${p}" class="page clip" data-start="${page.start}" data-duration="${dur}" data-track-index="${track++}">${spans}</div>`);
    for (const w of page.words) {
      js.push(`tl.fromTo("#w${w.index}", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1.1, duration: 0.08, ease: "power2.out" }, ${w.start});`);
      js.push(`tl.to("#w${w.index}", { scale: 1, duration: 0.1, ease: "power1.out" }, ${round3(Math.max(w.start + 0.08, w.end))});`);
    }
  });

  html.push(
    `<div id="endcard" class="endcard clip" data-start="${photoSpan}" data-duration="${ENDCARD_SECONDS}" data-track-index="${track++}">` +
    `<div class="brand">${esc(brand)}</div><div class="match">${esc(match)}</div></div>`,
  );

  const edge = `-3px -3px 0 ${CAPTION_EDGE}, 3px -3px 0 ${CAPTION_EDGE}, -3px 3px 0 ${CAPTION_EDGE}, 3px 3px 0 ${CAPTION_EDGE}`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<script src="gsap.min.js"></script>
<style>
  html, body { margin: 0; background: #101412; }
  #stage { position: relative; width: ${FRAME_W}px; height: ${FRAME_H}px; overflow: hidden; background: #101412; }
  .shot { position: absolute; inset: 0; overflow: hidden; background: #101412; transform-origin: center center; }
  .shot img { position: absolute; width: 140%; height: 140%; left: -20%; top: -20%; object-fit: cover; transform-origin: center center; }
  .flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
  .page { position: absolute; left: 64px; right: 64px; bottom: 240px; text-align: center; font-family: Arial, "DejaVu Sans", sans-serif; font-weight: 800; font-size: 68px; line-height: 1.2; }
  .word { display: inline-block; opacity: 0; color: ${CAPTION_FILL}; text-shadow: ${edge}; }
  .fig { position: absolute; left: 72px; top: 180px; font-family: Arial, "DejaVu Sans", sans-serif; font-weight: 800; font-size: 150px; color: #c5ed74; text-shadow: ${edge}; }
  .tag { position: absolute; left: 64px; bottom: 560px; display: flex; align-items: stretch; gap: 16px; font-family: Arial, "DejaVu Sans", sans-serif; }
  .tag-bar { width: 12px; background: #c5ed74; }
  .tag-name { padding: 14px 24px; background: rgba(16, 20, 18, 0.86); color: #fff; font-size: 46px; font-weight: 800; }
  .endcard { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #101412; color: #c5ed74; font-family: Arial, "DejaVu Sans", sans-serif; font-weight: 800; }
  .endcard .brand { font-size: 84px; }
  .endcard .match { margin-top: 24px; font-size: 36px; color: #fff; font-weight: 700; }
</style>
</head>
<body>
<div id="stage" data-composition-id="main" data-start="0" data-width="${FRAME_W}" data-height="${FRAME_H}" data-duration="${total}">
  ${html.join('\n  ')}
</div>
<script>
  function fmt(v, s) { var n = v.toFixed(s.decimals); return s.prefix + (s.comma ? n.replace(".", ",") : n) + s.suffix; }
  const tl = gsap.timeline({ paused: true });
  ${js.join('\n  ')}
  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
</script>
</body>
</html>
`;
}
