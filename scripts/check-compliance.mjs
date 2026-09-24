/** Lint bloqueante pre-render: valida guiones y media-pack contra COMPLIANCE.md. */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkScript, checkDescription, checkMediaManifest } from '../src/lib/compliance.js';

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

const mediaDir = 'public/data/media-pack';
let mediaFiles = [];
try {
  mediaFiles = (await readdir(mediaDir)).filter(f => f.endsWith('.json'));
} catch {
  console.log('lint:shorts: sin media-pack todavía, ok');
  process.exit(failures ? 1 : 0);
}
let mediaFailures = 0;
for (const file of mediaFiles) {
  const data = JSON.parse(await readFile(join(mediaDir, file), 'utf8'));
  for (const error of checkMediaManifest(data, { matchId: file.replace(/\.json$/, '') })) {
    console.error(`${file}: ${error}`);
    mediaFailures += 1;
  }
}
console.log(`lint:shorts: media-pack ${mediaFiles.length} archivos, ${mediaFailures} fallos`);
process.exit(failures || mediaFailures ? 1 : 0);
