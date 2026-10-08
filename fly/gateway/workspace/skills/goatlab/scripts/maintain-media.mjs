/** Conservative maintenance, portable to Actions and Fly; no provider calls. */
import { readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { buildPruneContext, resolvePruneMatch, pruneDue } from '../lib/pruning.js';
import { transact } from './agnes-state.mjs';

const run = promisify(execFile);
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const read = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } };
const names = async path => { try { return await readdir(path); } catch { return []; } };

export function mediaArtifactId(name) {
  const found = name.match(/^([A-Za-z0-9][A-Za-z0-9_-]{0,199})(?:\.(?:progress|content))?\.(?:json|ready|running|log)$/);
  return found?.[1] ?? null;
}

export async function maintainMedia({ repo = process.env.GOATLAB_REPO || '.', dir = process.env.MEDIA_PACK_DIR || join(repo, 'public/data/media-pack'), protectedMatch, protectedMatches = [], now = Date.now(), transactImpl = transact, r2Impl } = {}) {
  const operations = { media: { opsA: 0, opsB: 0 }, control: { opsA: 0, opsB: 0 } };
  const count = value => { for (const group of ['media', 'control']) for (const key of ['opsA', 'opsB']) operations[group][key] += Number(value?.[group]?.[key]) || 0; };
  const control = async (...args) => { try { const result = await transactImpl(...args); count(result.operations); return result; } catch (error) { count(error.operations); throw error; } };
  const fixtures = await read(join(repo, 'public/data/fixtures.json'));
  const ledger = await read(join(repo, 'public/data/finished-at.json'));
  const context = buildPruneContext(Array.isArray(fixtures?.matches) ? fixtures.matches : [], ledger);
  const files = await names(dir);
  const caches = (await names(join(dir, 'gen'))).filter(id => ID.test(id));
  const candidates = new Set([...files.map(mediaArtifactId).filter(Boolean), ...caches]);
  const protectedIds = new Set();
  for (const id of [protectedMatch, ...protectedMatches].filter(Boolean)) {
    const fixture = resolvePruneMatch(id, context);
    for (const alias of [id, fixture?.id, fixture?.webId, ...(fixture?.ids ?? [])].filter(Boolean)) protectedIds.add(alias);
  }
  const deletedIds = [], preservedIds = [], deletedPaths = [];
  const removeRemote = r2Impl ?? (async prefix => {
    // Without media credentials there is no proof of remote deletion.
    if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_ACCOUNT_ID) return null;
    try {
      const { stdout } = await run(process.execPath, [join(repo, 'scripts/r2-media.mjs'), 'del-prefix', prefix], { maxBuffer: 8 * 1024 * 1024 });
      const result = JSON.parse(stdout); count(result.operations); return result;
    } catch { return null; }
  });
  for (const id of candidates) {
    const match = resolvePruneMatch(id, context);
    if (protectedIds.has(id) || (match && [match.id, match.webId, ...(match.ids ?? [])].some(alias => protectedIds.has(alias))) || !pruneDue(match, context.seen, now)) continue;
    let claim;
    const matchId = match.webId ?? match.id;
    const provenAliases = [...context.byId].filter(([, resolved]) => resolved === match).map(([alias]) => alias);
    const relatedMatchIds = [...new Set([matchId, match.id, ...(match.ids ?? []), ...provenAliases].filter(value => ID.test(value)))];
    try { claim = await control('cleanupclaim', { matchId, relatedMatchIds, claimId: randomUUID(), pruneDue: true }); }
    catch { preservedIds.push(id); continue; }
    if (!claim.canDelete) { preservedIds.push(id); continue; }
    // The slash confines deletion to this exact validated ID, including legacy aliases.
    let remote;
    try { remote = await removeRemote(`partidos/${id}/`); }
    catch { preservedIds.push(id); continue; }
    if (!remote || remote.ok !== true) { preservedIds.push(id); continue; }
    try {
      for (const [identity, claimId] of Object.entries(claim.claims ?? { [matchId]: claim.claimId })) await control('cleanupconfirm', { matchId: identity, claimId });
    }
    catch { preservedIds.push(id); continue; }
    for (const name of files.filter(name => mediaArtifactId(name) === id)) {
      await rm(join(dir, name), { force: true });
      deletedPaths.push(join(dir, name));
    }
    if (caches.includes(id)) await rm(join(dir, 'gen', id), { recursive: true, force: true });
    deletedIds.push(id);
  }
  return { deletedIds, preservedIds, deletedPaths, operations };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = { protectedMatches: [] };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--match=')) options.protectedMatch = arg.slice(8);
    else if (arg.startsWith('--protect=')) options.protectedMatches.push(arg.slice(10));
    else if (arg.startsWith('--repo=')) options.repo = arg.slice(7);
    else if (arg.startsWith('--out=')) options.dir = arg.slice(6);
  }
  try { console.log(JSON.stringify(await maintainMedia(options))); }
  catch { console.error('media: mantenimiento no confirmado; artefactos conservados'); process.exitCode = 2; }
}
