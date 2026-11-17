/** Conservative maintenance, portable to Actions and Fly; no provider calls. */
import { readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { buildPruneContext, resolvePruneMatch, pruneDue, PRUNE_GRACE_MS } from '../../src/lib/pruning.js';
import { matchDay, resolveCanonical } from '../../src/lib/teams.js';
import { transact } from '../../scripts/agnes-state.mjs';

const run = promisify(execFile);
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OBJECT_KEY = /^partidos\/([A-Za-z0-9][A-Za-z0-9_-]{0,199})\//;
const read = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } };
const names = async path => { try { return await readdir(path); } catch { return []; } };

export function mediaArtifactId(name) {
  const found = name.match(/^([A-Za-z0-9][A-Za-z0-9_-]{0,199})(?:\.(?:progress|content))?\.(?:json|ready|running|log)$/);
  return found?.[1] ?? null;
}

function historicalResults(rows, teams, now) {
  const byDay = new Map(), byWebId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !ID.test(row.id ?? '') || !ID.test(row.competition ?? '') || !DATE.test(row.date ?? '')
      || ![row.homeScore, row.awayScore].every(score => Number.isSafeInteger(score) && score >= 0)) continue;
    const dayStart = Date.parse(row.date);
    // Historical results carry a match date, not a trustworthy time of final whistle.
    if (!(now > dayStart + DAY_MS + PRUNE_GRACE_MS)) continue;
    const home = resolveCanonical(teams, row.home, { competition: row.competition })?.web;
    const away = resolveCanonical(teams, row.away, { competition: row.competition })?.web;
    if (!home || !away || home === away) continue;
    const pair = `${home}-vs-${away}`;
    const evidence = { row, pair };
    const day = byDay.get(row.date) ?? [];
    day.push(evidence);
    byDay.set(row.date, day);
    if (row.kickoff && Date.parse(row.kickoff) >= dayStart && Date.parse(row.kickoff) < dayStart + DAY_MS) {
      const webId = `${pair}-${matchDay(row.kickoff)}`;
      const match = byWebId.get(webId) ?? [];
      match.push(evidence);
      byWebId.set(webId, match);
    }
  }
  return { byDay, byWebId };
}

async function historicalMatch(id, saved, history, data, dir) {
  const artifact = saved ?? (await Promise.all([
    read(join(dir, `${id}.json`)),
    read(join(data, 'youtube-scripts', `${id}.json`)),
    read(join(data, 'image-prompts', `${id}.json`)),
  ])).find(value => value?.matchId === id && Number.isFinite(Date.parse(value.kickoff)) && value.competition);
  let matches = history.byWebId.get(id) ?? [];
  if (artifact) {
    const kickoff = Date.parse(artifact.kickoff);
    if (!Number.isFinite(kickoff)) return null;
    const utcDay = new Date(kickoff).toISOString().slice(0, 10);
    matches = (history.byDay.get(utcDay) ?? []).filter(({ row, pair }) =>
      row.competition === artifact.competition && `${pair}-${matchDay(artifact.kickoff)}` === id
      && (!row.kickoff || Date.parse(row.kickoff) === kickoff)
      && (!saved || [saved.id, ...(saved.ids ?? [])].includes(row.id)));
  }
  if (matches.length !== 1) return null;
  return { id: matches[0].row.id, webId: id, ids: saved?.ids ?? [] };
}

export async function maintainMedia({ repo = process.env.GOATLAB_REPO || '.', dir = process.env.MEDIA_PACK_DIR || join(repo, 'public/data/media-pack'), protectedMatch, protectedMatches = [], now = Date.now(), transactImpl = transact, r2Impl, listRemote, dryRun = false } = {}) {
  const operations = { media: { opsA: 0, opsB: 0 }, control: { opsA: 0, opsB: 0 } };
  const count = value => { for (const group of ['media', 'control']) for (const key of ['opsA', 'opsB']) operations[group][key] += Number(value?.[group]?.[key]) || 0; };
  const control = async (...args) => { try { const result = await transactImpl(...args); count(result.operations); return result; } catch (error) { count(error.operations); throw error; } };
  const data = join(repo, 'public/data');
  const [fixtures, ledger, results, catalog] = await Promise.all(
    ['fixtures', 'finished-at', 'results', 'teams'].map(name => read(join(data, `${name}.json`))),
  );
  const current = new Set(Array.isArray(fixtures?.matches) ? fixtures.matches : []);
  const context = buildPruneContext([...current], ledger);
  const history = historicalResults(results?.results, catalog?.teams, now);
  const files = await names(dir);
  const caches = (await names(join(dir, 'gen'))).filter(id => ID.test(id));
  const candidates = new Set([...files.map(mediaArtifactId).filter(Boolean), ...caches]);
  const r2 = async (...args) => {
    const { stdout } = await run(process.execPath, [join(repo, 'scripts/r2-media.mjs'), ...args], { maxBuffer: 8 * 1024 * 1024 });
    const result = JSON.parse(stdout);
    count(result.operations);
    return result;
  };
  const inventory = new Map();
  const objects = listRemote ? await listRemote() : r2Impl ? [] : (await r2('list-partidos')).objects;
  for (const { key, bytes } of objects) {
    const id = key.match(OBJECT_KEY)?.[1];
    if (!id) continue;
    candidates.add(id);
    inventory.set(id, (inventory.get(id) ?? 0) + bytes);
  }
  const protectedIds = new Set();
  for (const id of [protectedMatch, ...protectedMatches].filter(Boolean)) {
    const fixture = resolvePruneMatch(id, context);
    for (const alias of [id, fixture?.id, fixture?.webId, ...(fixture?.ids ?? [])].filter(Boolean)) protectedIds.add(alias);
  }
  const dueIds = [], deletedIds = [], preservedIds = [], deletedPaths = [];
  let dueBytes = 0, reclaimedBytes = 0;
  const removeRemote = r2Impl ?? (prefix => r2('del-prefix', prefix));
  for (const id of candidates) {
    const saved = resolvePruneMatch(id, context);
    let match = saved;
    if (!pruneDue(saved, context.seen, now)) {
      // A current fixture or ambiguous alias takes priority over historical evidence.
      if (!Array.isArray(fixtures?.matches) || (context.byId.has(id) && !saved)
        || current.has(saved) || (saved && saved.status !== 'NS')) continue;
      match = await historicalMatch(id, saved, history, data, dir);
      if (match && context.byId.has(match.id)) {
        const providerMatch = resolvePruneMatch(match.id, context);
        if (!providerMatch || current.has(providerMatch) || (saved && providerMatch !== saved)
          || (providerMatch.webId && providerMatch.webId !== id)) continue;
      }
    }
    if (!match) continue;
    const matchId = match.webId ?? match.id;
    const provenAliases = saved ? [...context.byId].filter(([, resolved]) => resolved === saved).map(([alias]) => alias) : [];
    const relatedMatchIds = [...new Set([matchId, match.id, ...(match.ids ?? []), ...provenAliases].filter(value => ID.test(value)))];
    if (protectedIds.has(id) || relatedMatchIds.some(alias => protectedIds.has(alias))) continue;
    const bytes = inventory.get(id) ?? 0;
    dueIds.push(id);
    dueBytes += bytes;
    if (dryRun) continue;
    let claim;
    try { claim = await control('cleanupclaim', { matchId, relatedMatchIds, claimId: randomUUID(), pruneDue: true }); }
    catch { preservedIds.push(id); continue; }
    if (!claim.canDelete) { preservedIds.push(id); continue; }
    // The slash confines deletion to this exact validated ID, including legacy aliases.
    let remote;
    try { remote = await removeRemote(`partidos/${id}/`); }
    catch { preservedIds.push(id); continue; }
    if (!remote || remote.ok !== true) { preservedIds.push(id); continue; }
    reclaimedBytes += bytes;
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
  return { dueIds, dueBytes, deletedIds, reclaimedBytes, preservedIds, deletedPaths, operations };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.env.MEDIA_ROLE !== 'producer' || process.env.GITHUB_ACTIONS !== 'true') {
    console.error('El mantenimiento remoto pertenece exclusivamente a GitHub Actions');
    process.exit(2);
  }
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
