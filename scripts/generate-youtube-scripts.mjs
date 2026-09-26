/** Guiones faltantes de Shorts: el modelo de turno redacta con el skill
 *  redactar-guiones-shorts. Un JSON ya existente no se toca.
 *  En corrida completa (sin --match/--limit) poda además los JSONs rancios
 *  cuyo partido ya salió de fixtures. */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createProviderBreaker, extractJson, withFailover } from '../src/lib/llm.js';
import {
  acceptYoutubeDraft,
  buildDescription,
  cleanLede,
  countWords,
  missingScripts,
  scriptFacts,
  selectMatches,
  staleScripts,
  youtubeUserPayload,
} from '../src/lib/youtube.js';
import { esName } from '../src/lib/teams.js';
import { checkDescription } from '../src/lib/compliance.js';

const dir = 'public/data/youtube-scripts';
const skillPath = '.agents/skills/redactar-guiones-shorts/SKILL.md';
const args = new Map(process.argv.slice(2).map(a => a.split('=')));
const onlyMatch = args.get('--match');
const limitRaw = args.get('--limit');
const force = args.has('--force');
const fullRun = !onlyMatch && limitRaw == null && !force;

const fixtures = JSON.parse(await readFile('public/data/fixtures.json', 'utf8'));
const evaluation = JSON.parse(await readFile('public/data/evaluation-report.json', 'utf8'));
let scorers = null;
try {
  scorers = JSON.parse(await readFile('public/data/scorers.json', 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const published = evaluation?.published === true;
const skill = (await readFile(skillPath, 'utf8')).replace(/^---\n[\s\S]*?\n---\n*/, '').trim();

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

const names = (await readdir(dir)).filter(f => f.endsWith('.json'));
const pending = force ? matches : missingScripts(matches, names);
let failures = 0;
let written = 0;
const skipped = force ? 0 : matches.length - pending.length;
if (!pending.length) {
  console.log(`shorts: ${skipped} ya redactados, 0 faltantes`);
  process.exit(0);
}
if (force) console.log(`shorts: reescritura forzada de ${pending.length} partidos`);

const breaker = createProviderBreaker();
for (const match of pending) {
  const matchId = match.webId ?? match.id;
  const facts = scriptFacts(match, scorers);
  const file = join(dir, `${matchId}.json`);
  try {
    const { value, provider, model } = await withFailover([
      { role: 'system', content: skill },
      { role: 'user', content: `Sigue el procedimiento. Cada narración es un solo párrafo corrido, menos de 50 s, con prosa hablada. Copia nombres y cifras de equipos de este objeto; en guiones 3, 4, 7 y 9 usa tu conocimiento reciente de jugadores si hace falta. Responde solo el JSON de 10 guiones.\n${JSON.stringify(youtubeUserPayload({ published, facts }))}` },
    ], {
      maxTokens: 4500,
      timeoutMs: 120_000,
      breaker,
      validate: content => {
        const draft = extractJson(content);
        const lede = cleanLede(draft?.lede);
        const description = buildDescription({ lede, matchId, competition: match.competition });
        const errors = [
          ...acceptYoutubeDraft({ ...draft, lede }, { facts, published }),
          ...checkDescription(description, { matchId }),
        ];
        if (errors.length) throw new Error(errors.slice(0, 8).join('; '));
        const scripts = draft.scripts.map((script, i) => {
          const narration = String(script.narration).trim();
          return { n: i + 1, hook: String(script.hook).trim(), narration, words: countWords(narration) };
        });
        return { scripts, description };
      },
    });
    const payload = {
      matchId,
      providerId: match.id,
      scripts: value.scripts,
      description: value.description,
      home: esName(match.home),
      away: esName(match.away),
      competition: match.competition,
      kickoff: match.kickoff,
      author: { provider, model },
      generatedAt: new Date().toISOString(),
    };
    await writeFile(file, JSON.stringify(payload, null, 2));
    written += 1;
    console.log(`shorts: ${file} redactado por ${provider}/${model}`);
  } catch (error) {
    failures += 1;
    console.error(`shorts: ${file}: ${error.message}`);
  }
}
console.log(`shorts: ${written} redactados, ${skipped} ya existían, ${failures} fallos`);
process.exit(failures ? 1 : 0);
