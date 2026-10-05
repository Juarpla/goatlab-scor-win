import { spawnSync } from 'node:child_process';
import { CONTENT_CATEGORIES, CONTENT_PROVIDER_ORDER } from '../src/lib/match-content.js';
const raw = process.argv.slice(2), category = raw.find(a => a.startsWith('--category='))?.split('=')[1] ?? 'all';
if (category !== 'all' && !CONTENT_CATEGORIES[category]) throw new Error('Categoría desconocida');
const categories = category === 'all' ? Object.keys(CONTENT_CATEGORIES) : [category];
let failures = 0;
for (const name of categories) {
  const result = spawnSync(process.execPath, [name === 'scripts' ? 'scripts/generate-youtube-scripts.mjs' : 'scripts/generate-match-prompts.mjs', ...raw.filter(a => !a.startsWith('--category=')), ...(name === 'scripts' ? [] : [`--category=${name}`])], { stdio: 'inherit', env: { ...process.env, SCRIPT_PROVIDER_ORDER: process.env.SCRIPT_PROVIDER_ORDER?.trim() || CONTENT_PROVIDER_ORDER } });
  if (result.error || result.status !== 0) failures++;
}
process.exitCode = failures ? 1 : 0;
