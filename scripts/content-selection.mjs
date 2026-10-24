/** Freeze a run's selection and pass manual intent to the downstream media workflow. */
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { readContentSelection } from '../src/lib/content-selection.js';
import { contentMatches, defaultTopN, registerExtra, topFreshness } from '../src/lib/top.js';
const file = process.env.CONTENT_SELECTION_FILE || '.cache/content-selection.json';
if (process.argv.includes('--activate-media')) {
  const snapshot = JSON.parse(await readFile(file, 'utf8'));
  if (snapshot.version !== 1 || !Array.isArray(snapshot.ids)) throw new Error('Selección inválida');
  const { request } = await readContentSelection({ env: { CONTENT_SELECTION_FILE: file } });
  const match = request?.match || '';
  if (match && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(match)) throw new Error('ID manual inválido');
  if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `CONTENT_AUTOMATIC=${request?.automatic ? '1' : '0'}\nMATCH=${match}\n`);
  console.log(`media: selección de scripting: ${snapshot.ids.join(', ') || 'vacía'}`);
} else {
  const { top, fixtures } = await readContentSelection({ env: {} });
  const request = { automatic: process.env.CONTENT_AUTOMATIC === '1', match: process.env.MATCH || null, top: process.env.TOP || null };
  const freshness = topFreshness(top, { manual: !!request.match });
  if (!freshness.valid) throw new Error(`top.json rechazado (${freshness.reason})`);
  const n = Number(request.top) >= 1 ? Math.floor(Number(request.top)) : defaultTopN(process.env);
  const selected = contentMatches(top, fixtures.matches, { automatic: request.automatic, onlyMatch: request.match, n });
  if (request.match && !selected.length) throw new Error(`Partido manual no encontrado: ${request.match}; ningún archivo fue eliminado`);
  const ids = selected.map(m => m.webId ?? m.id);
  // Register additive manual requests in the current top; never rewrite its ranking.
  if (!request.automatic) {
    const registered = registerExtra(top, ids);
    if (registered.added.length) await writeFile('public/data/top.json', JSON.stringify(registered.top, null, 2));
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ version: 1, createdAt: new Date().toISOString(), request, ids, top, fixtures }, null, 2));
  console.log(`content: ${ids.length} partidos fijados: ${ids.join(', ') || 'ninguno'}`);
}
