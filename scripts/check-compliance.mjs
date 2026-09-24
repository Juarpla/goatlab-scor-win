/** Lint bloqueante pre-render: valida los guiones de Shorts contra COMPLIANCE.md. */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkScript, checkDescription } from '../src/lib/compliance.js';

const dir = 'public/data/youtube-scripts';
let files = [];
try {
  files = (await readdir(dir)).filter(f => f.endsWith('.json'));
} catch {
  console.log('lint:shorts: sin guiones todavía, ok');
  process.exit(0);
}
const evaluation = JSON.parse(await readFile('public/data/evaluation-report.json', 'utf8'));
const published = evaluation?.published === true;
let failures = 0;
for (const file of files) {
  const data = JSON.parse(await readFile(join(dir, file), 'utf8'));
  const matchId = data.matchId ?? file.replace(/\.json$/, '');
  for (const [i, script] of (data.scripts ?? []).entries()) {
    for (const error of checkScript(script, { published, matchId })) {
      console.error(`${file} guion ${i}: ${error}`);
      failures += 1;
    }
  }
  for (const error of checkDescription(data.description, { matchId })) {
    console.error(`${file} descripción: ${error}`);
    failures += 1;
  }
}
console.log(`lint:shorts: ${files.length} archivos, ${failures} fallos (published=${published})`);
process.exit(failures ? 1 : 0);
