import { readdir, readFile } from 'node:fs/promises';
import { CONTENT_CATEGORIES, validateContent } from '../src/lib/match-content.js';
let failures = 0;
for (const [category, spec] of Object.entries(CONTENT_CATEGORIES).filter(([, s]) => s.kinds)) {
  let files; try { files = await readdir(`public/data/${spec.directory}`); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
  for (const name of files.filter(f => f.endsWith('.json'))) {
    const data = JSON.parse(await readFile(`public/data/${spec.directory}/${name}`, 'utf8'));
    if (!validateContent(data, category, name.slice(0, -5))) { failures++; console.error(`${category}/${name}: contenido inválido`); }
  }
}
process.exitCode = failures ? 1 : 0;
