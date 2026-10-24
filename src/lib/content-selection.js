/** Read a frozen scripting handoff when supplied; never overwrite current top.json with it. */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
export async function readContentSelection({ repo = '.', env = process.env } = {}) {
  if (env.CONTENT_SELECTION_FILE) {
    const snapshot = JSON.parse(await readFile(resolve(repo, env.CONTENT_SELECTION_FILE), 'utf8'));
    if (snapshot.version !== 1 || !Array.isArray(snapshot.ids) || !Array.isArray(snapshot.fixtures?.matches)
      || snapshot.ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id))) throw new Error('Selección de contenido inválida');
    return { top: { ...snapshot.top, selectionIds: snapshot.ids }, fixtures: snapshot.fixtures, request: snapshot.request };
  }
  let top = null;
  try { top = JSON.parse(await readFile(join(repo, 'public/data/top.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') top = {}; }
  return { top, fixtures: JSON.parse(await readFile(join(repo, 'public/data/fixtures.json'), 'utf8')) };
}
