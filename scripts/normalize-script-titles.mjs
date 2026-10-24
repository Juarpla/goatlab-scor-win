import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeScriptTitles } from '../src/lib/script-titles.js';
const dir = 'public/data/youtube-scripts';
let changed = 0;
for (const name of await readdir(dir)) {
  if (!name.endsWith('.json')) continue;
  const file = join(dir, name), data = JSON.parse(await readFile(file, 'utf8'));
  const updated = normalizeScriptTitles(data);
  if (JSON.stringify(updated.scripts) === JSON.stringify(data.scripts)) continue;
  await writeFile(file, JSON.stringify(updated, null, 2));
  changed++;
}
console.log(`Títulos normalizados: ${changed}; narraciones conservadas`);
