// Remotion implementation of the renderer interface.
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compositionProps } from '../../contract/edit-plan.js';
import { FONT_FILE } from '../../contract/short-format.js';
import { authoredProps } from './authored-composition.mjs';
import { renderRemotion } from './remotion-render.mjs';

export const name = 'remotion';
const ASSETS = fileURLToPath(new URL('./assets', import.meta.url));

export function props(prepared, plan) {
  return plan?.version === 5
    ? authoredProps(prepared, plan)
    : compositionProps({ ...prepared, plan });
}

export function materialize(tmp) {
  copyFileSync(join(ASSETS, FONT_FILE), join(tmp, FONT_FILE));
  copyFileSync(join(ASSETS, 'brand.svg'), join(tmp, 'brand.svg'));
}

export function render(tmp, out, opts) {
  return renderRemotion(tmp, out, opts);
}
