import { bundle } from '@remotion/bundler';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const renderRoot = fileURLToPath(new URL('.', import.meta.url));
export const bundleDir = fileURLToPath(new URL('./dist-remotion/', import.meta.url));
export async function buildVideoBundle() {
  return bundle({ entryPoint: fileURLToPath(new URL('./remotion/index.jsx', import.meta.url)), rootDir: existsSync(join(renderRoot, 'package.json')) ? renderRoot : join(renderRoot, '../..'), outDir: bundleDir, publicDir: null });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildVideoBundle();
