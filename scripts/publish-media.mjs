/** Publish only verified manifests, progress/reports and explicitly authorized deletions. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeQuotaReports, mergeHourlyReports } from '../src/lib/agnes-reports.js';
const execute = promisify(execFile);
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const read = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } };
const reportPaths = ['public/data/agnes-quota.json', 'public/data/r2-usage.json', 'public/data/media-pack/_agnes-hourly.json'];

export async function stageMedia({ repo = '.', publication = {}, maintenance = {}, manual = false } = {}) {
  const git = async (...args) => (await execute('git', args, { cwd: repo })).stdout.trim();
  const complete = new Set((publication.complete_ids ?? []).filter(id => ID.test(id)));
  const deleted = new Set([...(publication.deleted_ids ?? []), ...(maintenance.deletedIds ?? [])].filter(id => ID.test(id)));
  const allowed = new Set(reportPaths);
  if (manual) allowed.add('public/data/top.json');
  let names = []; try { names = await readdir(join(repo, 'public/data/media-pack')); } catch {}
  for (const name of names) {
    const progress = name.match(/^([A-Za-z0-9][A-Za-z0-9_-]{0,199})\.progress\.json$/);
    if (progress || (name.endsWith('.json') && complete.has(name.slice(0, -5)))) allowed.add('public/data/media-pack/' + name);
  }
  for (const id of deleted) for (const suffix of ['.json', '.progress.json', '.content.json']) allowed.add('public/data/media-pack/' + id + suffix);
  const tracked = new Set((await git('ls-files')).split('\n'));
  const paths = [];
  for (const path of allowed) {
    const exists = await read(join(repo, path));
    if (exists || (tracked.has(path) && deleted.has(path.split('/').at(-1).split('.')[0]))) paths.push(path);
  }
  const already = (await git('diff', '--cached', '--name-only')).split('\n').filter(Boolean);
  if (already.some(path => !paths.includes(path))) throw new Error('staging contiene archivos ajenos a la publicación media');
  for (const path of paths) await git('add', '-A', '--', ':(top,literal)' + path);
  return { paths: (await git('diff', '--cached', '--name-only')).split('\n').filter(Boolean) };
}

export async function pushMedia({ repo = '.', attempts = 3 } = {}) {
  const git = async (...args) => (await execute('git', args, { cwd: repo, env: { ...process.env, GIT_EDITOR: 'true' } })).stdout;
  for (let attempt = 0; attempt < attempts; attempt++) {
    await git('fetch', 'origin', 'main');
    try { await git('rebase', '--autostash', 'origin/main'); }
    catch {
      const conflicts = (await git('diff', '--name-only', '--diff-filter=U')).trim().split('\n').filter(Boolean);
      const mergers = { 'public/data/agnes-quota.json': mergeQuotaReports, 'public/data/media-pack/_agnes-hourly.json': mergeHourlyReports };
      if (!conflicts.length || conflicts.some(path => !mergers[path])) { await git('rebase', '--abort'); throw new Error('conflicto no previsto con main'); }
      try {
        for (const path of conflicts) {
          const ours = JSON.parse(await git('show', ':2:' + path)), theirs = JSON.parse(await git('show', ':3:' + path));
          await writeFile(join(repo, path), JSON.stringify(mergers[path](ours, theirs), null, 2) + '\n');
          await git('add', '--', ':(top,literal)' + path);
        }
        await git('rebase', '--continue');
      } catch { await git('rebase', '--abort'); throw new Error('no se pudo resolver el reporte concurrente'); }
    }
    try { await git('push', 'origin', 'HEAD:main'); return { pushed: true }; } catch {}
  }
  throw new Error('push rechazado después de tres intentos');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.includes('--push')) console.log(JSON.stringify(await pushMedia()));
    else console.log(JSON.stringify(await stageMedia({ publication: await read('.cache/media-publication.json') ?? {}, maintenance: await read('.cache/media-maintenance.json') ?? {}, manual: process.argv.includes('--manual') })));
  } catch (error) { console.error(String(error.message)); process.exitCode = 1; }
}
