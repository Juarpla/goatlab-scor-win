/** Top-5 como dato: ranking completo de partidos NS por relevancia, escrito por
 *  1-update-data tras refrescar datos. Guiones, prompts y banco leen el mismo
 *  archivo, así nunca divergen. Uso: node scripts/build-top.mjs
 *  (respeta GOATLAB_REPO; conserva extra y expulsa lo que salió de la ventana). */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { rankMatches } from '../src/lib/teams.js';
import { TOP_FILENAME, TOP_VERSION, defaultTopN, liveIds, pruneExtra } from '../src/lib/top.js';

export async function buildTop({ repo = process.env.GOATLAB_REPO || '.', env = process.env } = {}) {
  const dataDir = `${repo}/public/data`;
  const fixtures = JSON.parse(await readFile(`${dataDir}/fixtures.json`, 'utf8'));
  const matches = fixtures.matches ?? [];
  const ranked = rankMatches(matches.filter(m => m?.status === 'NS'));
  let prev = null;
  try {
    prev = JSON.parse(await readFile(`${dataDir}/${TOP_FILENAME}`, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const top = pruneExtra({ ranking: [], extra: prev?.extra ?? [] }, liveIds(matches));
  const out = {
    version: TOP_VERSION,
    generatedAt: new Date().toISOString(),
    n: defaultTopN(env),
    ranking: ranked.map(m => ({ id: m.webId ?? m.id, home: m.home ?? null, away: m.away ?? null, kickoff: m.kickoff ?? null })),
    extra: top.extra,
  };
  await mkdir(dataDir, { recursive: true });
  await writeFile(`${dataDir}/${TOP_FILENAME}`, JSON.stringify(out, null, 2));
  console.log(`top: ${out.ranking.slice(0, out.n).map(r => r.id).join(', ')} (+${out.extra.length} extras)`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildTop();
