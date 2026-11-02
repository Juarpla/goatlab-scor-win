// Renderer registry. A renderer exports: name, props(prepared, plan),
// materialize(tmp) and render(tmp, out, opts). To add a technology, create
// render/<name>/index.mjs and register it below; select it with VIDEO_RENDERER.
import * as remotion from './remotion/index.mjs';

const RENDERERS = { remotion };

export function getRenderer(name = process.env.VIDEO_RENDERER || 'remotion') {
  const renderer = RENDERERS[name];
  if (!renderer) throw new Error(`renderer desconocido: ${name}; disponibles: ${Object.keys(RENDERERS).join(', ')}`);
  return renderer;
}
