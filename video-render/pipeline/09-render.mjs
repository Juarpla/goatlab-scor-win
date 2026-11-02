// Stage 09: delegate the silent capture to the configured renderer.
import { getRenderer } from '../render/index.mjs';

export async function renderSilent(tmp, out, { workers = process.env.RENDER_WORKERS || 1, onProgress, cancelSignal, isCancelled } = {}) {
  return getRenderer().render(tmp, out, { workers, onProgress, cancelSignal, isCancelled });
}
