/** Top editorial: próximos partidos de Barcelona y Madrid sin límite de días;
 *  el resto combina cercanía, atractivo del encuentro y repercusión. Lo escribe 1-update-data. Guiones, prompts y banco leen
 *  el mismo archivo. Uso: node scripts/build-top.mjs
 *  (respeta GOATLAB_REPO; conserva extra hasta final confirmado más gracia). */
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildPruneContext, resolvePruneMatch, pruneDue } from '../src/lib/pruning.js';
import { contentRanking } from '../src/lib/teams.js';
import { TOP_FILENAME, TOP_VERSION, pruneExtra, providerOnlyId } from '../src/lib/top.js';

export async function buildTop({ repo = process.env.GOATLAB_REPO || '.', env = process.env, now = Date.now() } = {}) {
  const dataDir = `${repo}/public/data`;
  const fixtures = JSON.parse(await readFile(`${dataDir}/fixtures.json`, 'utf8'));
  const matches = fixtures.matches ?? [];
  const upcoming = matches.filter(m => m?.status === 'NS' && Date.parse(m.kickoff) > now);
  for (const match of upcoming.filter(match => providerOnlyId(match.webId ?? match.id))) {
    console.log(`top: omitido ${match.webId ?? match.id}; falta código descriptivo`);
  }
  const { ranked, priorityCount } = contentRanking(upcoming.filter(m => !providerOnlyId(m.webId ?? m.id)), now);
  let prev = null;
  try {
    prev = JSON.parse(await readFile(`${dataDir}/${TOP_FILENAME}`, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let finished = null;
  try { finished = JSON.parse(await readFile(`${dataDir}/finished-at.json`, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  const top = pruneExtra({ ranking: [], extra: prev?.extra ?? [] }, matches, finished, now);
  const out = {
    version: TOP_VERSION,
    generatedAt: new Date(now).toISOString(),
    n: 5,
    priority: priorityCount,
    ranking: ranked.map(m => ({ id: m.webId ?? m.id, home: m.home ?? null, away: m.away ?? null, kickoff: m.kickoff ?? null })),
    extra: top.extra,
  };
  const context = buildPruneContext(matches, finished);
  for (const category of ['youtube-scripts', 'image-prompts', 'video-prompts', 'motion-prompts']) {
    const dir = `${dataDir}/${category}`;
    let files;
    try { files = await readdir(dir); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const file of files) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]*\.json$/.test(file)) continue;
      if (pruneDue(resolvePruneMatch(file.slice(0, -5), context), context.seen, now)) await rm(`${dir}/${file}`);
    }
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(`${dataDir}/${TOP_FILENAME}`, JSON.stringify(out, null, 2));
  console.log(`top: ${out.ranking.slice(0, out.n).map(r => r.id).join(', ')} (+${out.extra.length} extras)`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildTop();
