// Stage 08: compile the director plan into the renderer's composition props.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRenderer } from '../render/index.mjs';
import { writeJson } from './00-io.mjs';

/** Render executes the director's plan; it has no creative model or local fallback. */
export function composeShort(tmp, plan) {
  const prepared = JSON.parse(readFileSync(join(tmp, 'prepared.json'), 'utf8'));
  const props = getRenderer().props(prepared, plan);
  writeJson(join(tmp, 'composition.json'), props);
  return props;
}
