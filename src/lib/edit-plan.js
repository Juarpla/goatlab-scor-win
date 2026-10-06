/** Resolution-aware motion, shared by Remotion and legacy plan adapters. */
import { FRAME_W, FRAME_H, FPS, MAX_FRAMES } from './short-format.js';
import { MOTION_KINDS, resolveMotion } from './motion-data.js';

const moves = {
  push: [{ scale: 1 }, { scale: 1.18 }], pull: [{ scale: 1.18 }, { scale: 1 }],
  'pan-left': [{ scale: 1.15, x: .035 }, { scale: 1.15, x: -.035 }],
  'pan-right': [{ scale: 1.15, x: -.035 }, { scale: 1.15, x: .035 }],
  rise: [{ scale: 1.15, y: .035 }, { scale: 1.15, y: -.035 }],
  drift: [{ scale: 1.12, x: -.025, y: .02 }, { scale: 1.18, x: .025, y: -.02 }],
  tilt: [{ scale: 1.15, rotation: -1.2 }, { scale: 1.15, rotation: 1.2 }],
  hold: [{ scale: 1 }, { scale: 1 }], 'cut-in': [{ scale: 1.22 }, { scale: 1.1 }],
};

/** Bound transforms by actual image resolution and available crop, not model guesses. */
export function boundedMotion(layer, photo) {
  const box = layer.box ?? { x: 0, y: 0, w: 1, h: 1 };
  const width = FRAME_W * box.w, height = FRAME_H * box.h;
  const iw = photo.width || width, ih = photo.height || height;
  const cover = iw >= width && ih >= height;
  const base = cover ? Math.max(width / iw, height / ih) : Math.min(1, width / iw, height / ih);
  const maxScale = Math.max(1, Math.min(1.35, 1 / base));
  const defaults = moves[layer.move] ?? moves.push;
  const convert = state => {
    const scale = Math.max(1, Math.min(maxScale, state.scale ?? 1));
    const marginX = Math.max(0, (iw * base * scale - width) / 2);
    const marginY = Math.max(0, (ih * base * scale - height) / 2);
    // Rotations consume crop margin; disable them rather than expose empty corners.
    const focus = layer.focus ?? { x: .5, y: .5 };
    return { scale, x: Math.max(-marginX, Math.min(marginX, (state.x ?? 0) * width + (.5 - focus.x) * iw * base * scale)),
      y: Math.max(-marginY, Math.min(marginY, (state.y ?? 0) * height + (.5 - focus.y) * ih * base * scale)), rotation: 0 };
  };
  return { from: convert(layer.from ?? defaults[0]), to: convert(layer.to ?? defaults[1]),
    imageWidth: iw * base, imageHeight: ih * base, cover };
}

/** Validate the final immutable render input, including old plan versions 1–3. */
export function compositionProps({ frames, photos = [], clips = [], words, plan, facts = [], motionPrompts = [], match = '' }) {
  if (!Number.isInteger(frames) || frames < 1 || frames > MAX_FRAMES) throw new Error('duración fuera de límite');
  if (!words?.length || !plan?.scenes?.length || ![1,2,3,4].includes(plan.version)) throw new Error('se requiere transcripción y plan de edición');
  const span = frames / FPS - 3;
  let cursor = 0;
  for (const scene of plan.scenes) {
    if (!Number.isFinite(scene.start) || !Number.isFinite(scene.end) || Math.abs(scene.start - cursor) > .03 || scene.end <= scene.start || scene.end > span + .03) throw new Error('timeline fuera de rango');
    cursor = scene.end;
    for (const layer of scene.layers ?? []) if (!Number.isInteger(layer.asset) || !photos[layer.asset]) throw new Error('imagen inexistente');
    for (const layer of scene.clips ?? []) {
      const clip = clips[layer.clip], offset = layer.offset ?? 0, duration = layer.duration ?? scene.end - scene.start;
      if (!Number.isInteger(layer.clip) || !clip || !Number.isFinite(offset) || !Number.isFinite(duration) || offset < 0 || duration <= 0 || offset + duration > clip.duration + .001 || duration > scene.end - scene.start + .001) throw new Error('recorte de clip inválido');
    }
    for (const graphic of scene.graphics ?? []) {
      if (MOTION_KINDS.includes(graphic.kind)) resolveMotion(graphic, facts, motionPrompts);
      else for (const id of graphic.factIds ?? []) if (!facts.some(f => f.id === id && Number.isFinite(f.value))) throw new Error('hecho inexistente');
    }
  }
  if (Math.abs(cursor - span) > .03) throw new Error('timeline incompleta');
  return { frames, photos, clips, words, plan, facts, motionPrompts, match, font: 'LiberationSans-Bold.ttf', brand: 'brand.svg' };
}
