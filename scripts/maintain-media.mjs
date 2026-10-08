import { maintainMedia } from '../fly/gateway/workspace/skills/goatlab/scripts/maintain-media.mjs';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { addUsage } from '../src/lib/r2-usage.js';

const match = process.argv.slice(2).find(value => value.startsWith('--match='))?.slice(8);
try {
  const result = await maintainMedia({ protectedMatch: match });
  if (Object.values(result.operations).some(row => row.opsA || row.opsB)) {
    const path = 'public/data/r2-usage.json';
    let ledger; try { ledger = JSON.parse(await readFile(path, 'utf8')); } catch {}
    const temporary = path + '.' + process.pid + '.tmp';
    await writeFile(temporary, JSON.stringify(addUsage(ledger, result.operations), null, 2) + '\n');
    await rename(temporary, path);
  }
  console.log(JSON.stringify(result));
}
catch { console.error('media: mantenimiento no confirmado; artefactos conservados'); process.exitCode = 2; }
