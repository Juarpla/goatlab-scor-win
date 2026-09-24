/** Genera public/data/youtube-scripts/<webId>.json (10 guiones + descripción).
 *  Default: todos los NS de fixtures.json (la ventana de 7 días del pipeline).
 *  En corrida completa (sin --match/--limit) poda además los JSONs rancios
 *  cuyo partido ya salió de fixtures (jugado, expirado o fuera de ventana). */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildYoutubeScripts, selectMatches, staleScripts, sameCore } from '../src/lib/youtube.js';
import { checkScript, checkDescription } from '../src/lib/compliance.js';

const dir = 'public/data/youtube-scripts';
const args = new Map(process.argv.slice(2).map(a => a.split('=')));
const onlyMatch = args.get('--match');
const limitRaw = args.get('--limit');
const fullRun = !onlyMatch && limitRaw == null;

const fixtures = JSON.parse(await readFile('public/data/fixtures.json', 'utf8'));
const evaluation = JSON.parse(await readFile('public/data/evaluation-report.json', 'utf8'));
const published = evaluation?.published === true;

let matches = selectMatches(fixtures.matches, { onlyMatch, limit: limitRaw });
if (!matches.length) {
  console.error('shorts: sin partidos NS para generar');
  process.exit(1);
}

await mkdir(dir, { recursive: true });
if (fullRun) {
  const live = matches.map(m => m.webId ?? m.id);
  for (const file of staleScripts(await readdir(dir), live)) {
    await rm(join(dir, file));
    console.log(`shorts: poda ${file}`);
  }
}

let failures = 0, written = 0;
for (const match of matches) {
  const out = buildYoutubeScripts(match);
  const file = join(dir, `${out.matchId}.json`);
  for (const [i, script] of out.scripts.entries()) {
    for (const error of checkScript(script, { published, matchId: out.matchId })) {
      console.error(`${file} guion ${i}: ${error}`);
      failures += 1;
    }
  }
  for (const error of checkDescription(out.description, { matchId: out.matchId })) {
    console.error(`${file} descripción: ${error}`);
    failures += 1;
  }
  const payload = {
    ...out,
    home: match.home,
    away: match.away,
    competition: match.competition,
    kickoff: match.kickoff,
    generatedAt: new Date().toISOString(),
  };
  // Escritura silenciosa: no tocar el archivo si el contenido no cambió
  // (se ignora generatedAt) para no ensuciar el commit diario del bot.
  let prev = null;
  try {
    prev = JSON.parse(await readFile(file, 'utf8'));
  } catch { /* nuevo archivo */ }
  if (prev && sameCore(prev, payload)) {
    console.log(`shorts: ${file} sin cambios`);
    continue;
  }
  await writeFile(file, JSON.stringify(payload, null, 2));
  written += 1;
  console.log(`shorts: ${file} (${out.scripts.length} guiones)`);
}
console.log(`shorts: ${written} escritos, ${failures} fallos`);
process.exit(failures ? 1 : 0);
