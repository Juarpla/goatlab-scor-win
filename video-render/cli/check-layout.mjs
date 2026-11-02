// Validate the media folder contract. Usage: node video-render/cli/check-layout.mjs
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutProblems } from '../contract/layout.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const problems = layoutProblems(ROOT);

if (!problems.length) {
  console.log('video-render layout: ok');
} else {
  for (const { path, message } of problems) console.error(`${relative(ROOT, path)}: ${message}`);
  console.error(`video-render layout: ${problems.length} problem(s)`);
  process.exitCode = 1;
}
