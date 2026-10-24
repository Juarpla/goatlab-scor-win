import { readdir, readFile } from 'node:fs/promises';
import { CONTENT_CATEGORIES, validateContent } from '../src/lib/match-content.js';
const selectionFile = process.argv.find(arg => arg.startsWith('--selection='))?.slice(12);
const selectionIds = selectionFile ? new Set(JSON.parse(await readFile(selectionFile, 'utf8')).ids) : null;
let failures = 0;
for (const [category, spec] of Object.entries(CONTENT_CATEGORIES).filter(([, s]) => s.kinds)) {
  let files; try { files = await readdir(`public/data/${spec.directory}`); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
  for (const name of files.filter(f => f.endsWith('.json') && (!selectionIds || selectionIds.has(f.slice(0,-5))))) {
    const data = JSON.parse(await readFile(`public/data/${spec.directory}/${name}`, 'utf8'));
    if (!validateContent(data, category, name.slice(0, -5))) { failures++; console.error(`${category}/${name}: contenido inválido`); }
  }
}
process.exitCode = failures ? 1 : 0;
