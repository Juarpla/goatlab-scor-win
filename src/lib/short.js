// Plantilla GoatLabShort v1 — Short vertical 1080x1920, 30fps, ~42s.
// 3 fotos con licencia (media-pack) en Ken Burns alternado + cross-dissolve,
// web-card propia (logo derivado de public/favicon.svg) y end card.
// Texto como PNG (resvg) porque el ffmpeg disponible no trae drawtext.
// Sin footage, sin logos de equipos/ligas, sin cuotas (ver COMPLIANCE.md).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TEXT_CACHE = `${ROOT}/scripts/.cache/short-text`;
const FAVICON = `${ROOT}/public/favicon.svg`;
const FONT_FAMILY = "Arial, 'DejaVu Sans', sans-serif";

export const SHORT_W = 1080;
export const SHORT_H = 1920;
export const SHORT_FPS = 30;
export const SEG_SECONDS = 14; // por foto
export const XFADE_SECONDS = 1; // cross-dissolve entre segmentos
export const ENDCARD_SECONDS = 3;
export const BG = '#101412';
export const ACCENT = '#c5ed74';
export const BRAND = 'goatlab.win';
export const UPSCALE = 2; // zoompan sobre imagen ampliada = zoom suave

// SVG de una línea de texto centrada (fondo transparente).
export function textSvg({ text, fontSize, color, weight = 'bold' }) {
  const h = Math.ceil(fontSize * 1.5);
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${h}">` +
    `<text x="500" y="${Math.ceil(fontSize * 1.15)}" font-family="${FONT_FAMILY}" ` +
    `font-size="${fontSize}" font-weight="${weight}" fill="${color}" text-anchor="middle">${esc}</text></svg>`;
}

function pngFromSvg(svg, fitWidth) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: fitWidth } }).render().asPng();
}

// PNG cacheado en scripts/.cache (gitignorados; determinista por contenido).
function cachedPng(key, make) {
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 12);
  const file = `${TEXT_CACHE}/${hash}.png`;
  if (!existsSync(file)) {
    mkdirSync(TEXT_CACHE, { recursive: true });
    writeFileSync(file, make());
  }
  return file;
}

export function logoPng() {
  const svg = readFileSync(FAVICON, 'utf8');
  return cachedPng(`logo:${svg}`, () => pngFromSvg(svg, 160));
}

export function textPng(opts) {
  const key = `text:${opts.fontSize}:${opts.color}:${opts.weight ?? 'bold'}:${opts.text}`;
  return cachedPng(key, () => pngFromSvg(textSvg(opts), 1000));
}

// Un segmento por foto: zoom in en pares, zoom out en impares (determinista).
export function segmentPlan(asset, i, segSeconds = SEG_SECONDS) {
  const frames = Math.round(segSeconds * SHORT_FPS);
  const direction = i % 2 === 0 ? 'in' : 'out';
  const zoom =
    direction === 'in' ? `1.0+0.5*on/${frames}` : `max(1.0,1.5-0.5*on/${frames})`;
  return { asset, index: i, seconds: segSeconds, frames, direction, zoom };
}

export function buildShortPlan({ script, media, variant = 0, segSeconds = SEG_SECONDS }) {
  const v = script.scripts[variant] ?? script.scripts[0];
  const segments = media.assets.map((a, i) => segmentPlan(a, i, segSeconds));
  const photosSeconds = segments.length * segSeconds - (segments.length - 1) * XFADE_SECONDS;
  const totalSeconds = photosSeconds + ENDCARD_SECONDS - XFADE_SECONDS;
  const step = segSeconds - XFADE_SECONDS;
  return {
    matchId: script.matchId,
    variant,
    width: SHORT_W,
    height: SHORT_H,
    fps: SHORT_FPS,
    hook: v.hook,
    brand: BRAND,
    bg: BG,
    accent: ACCENT,
    match: media.match ?? `${script.home} vs ${script.away}`,
    segments,
    photosSeconds,
    endcardSeconds: ENDCARD_SECONDS,
    endcardOffset: photosSeconds - XFADE_SECONDS,
    totalSeconds,
    xfadeOffsets: segments.slice(1).map((_, k) => step * (k + 1)),
  };
}

// filter_complex completo. logo/bottom/endMain/endSub = índices de sus inputs.
export function buildFilterGraph(plan, { logo, bottom, endMain, endSub }) {
  const W = plan.width;
  const H = plan.height;
  const pre = `${W * UPSCALE}:${H * UPSCALE}`;
  const parts = plan.segments.map((s) => {
    const px = `(iw-iw/zoom)/2${s.direction === 'in' ? '+' : '-'}50*on/${s.frames}`;
    return (
      `[${s.index}:v]scale=${pre}:force_original_aspect_ratio=increase,` +
      `crop=${pre},setsar=1,` +
      `zoompan=z='${s.zoom}':x='${px}':y='(ih-ih/zoom)/2':d=1:s=${W}x${H}:fps=${plan.fps},` +
      `settb=AVTB[v${s.index}]`
    );
  });
  let cur = 'v0';
  plan.xfadeOffsets.forEach((offset, k) => {
    const out = k === plan.xfadeOffsets.length - 1 ? 'xphotos' : `x${k + 1}`;
    parts.push(`[${cur}][v${k + 1}]xfade=transition=fade:duration=${XFADE_SECONDS}:offset=${offset}[${out}]`);
    cur = out;
  });
  const bg = BG.replace('#', '0x');
  parts.push(`color=c=${bg}:s=${W}x${H}:r=${plan.fps}:d=${plan.endcardSeconds},fps=${plan.fps},settb=AVTB,format=yuv420p[card]`);
  parts.push(`[xphotos][card]xfade=transition=fade:duration=${XFADE_SECONDS}:offset=${plan.endcardOffset}[vbase]`);
  parts.push(`[${logo}:v]format=rgba[vlogo]`);
  parts.push(`[${bottom}:v]format=rgba[vbottom]`);
  parts.push(`[${endMain}:v]format=rgba[vendmain]`);
  parts.push(`[${endSub}:v]format=rgba[vendsub]`);
  const end = `between(t,${plan.endcardOffset},${plan.totalSeconds})`;
  parts.push(
    `[vbase][vlogo]overlay=60:60[v1];` +
      `[v1][vbottom]overlay=(W-w)/2:H-280[v2];` +
      `[v2][vendmain]overlay=(W-w)/2:(H-h)/2-70:enable='${end}'[v3];` +
      `[v3][vendsub]overlay=(W-w)/2:(H-h)/2+80:enable='${end}',format=yuv420p[vout]`,
  );
  return parts.join(';');
}
