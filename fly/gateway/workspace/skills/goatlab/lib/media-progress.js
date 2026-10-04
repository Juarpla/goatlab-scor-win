import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { ASSETS_PER_MATCH, buildManifest, assetErrors } from './media.js';
import { checkMediaManifest } from './compliance.js';

/** Publish valid packs before the producer finishes; every file replaces atomically. */
export function mediaPublisher({ dir, match, facts = [], attemptStartedAt = Date.now(), clock = () => new Date().toISOString() }) {
  const matchId = match.webId ?? match.id;
  let count = 0, ready = false;
  const atomic = async (name, value) => {
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${matchId}${name}`);
    await writeFile(`${path}.tmp`, JSON.stringify(value));
    await rename(`${path}.tmp`, path);
  };
  return async (assets, phase) => {
    const payload = { ...buildManifest({ match, assets: [...new Map(assets.filter(a=>!assetErrors(a).length).map(a=>[`${a.source}:${a.id}`,a])).values()].slice(0, ASSETS_PER_MATCH) }), facts, generatedAt: clock() };
    count = payload.assets.length;
    const errors = checkMediaManifest(payload, { matchId });
    if (errors.length) throw new Error(`manifiesto inválido: ${errors.join('; ')}`);
    await atomic('.json', {...payload, bankStatus: phase === 'finished' ? (count === ASSETS_PER_MATCH ? 'complete' : 'partial') : 'preparing'});
    // Existing ready snapshots remain usable during an explicit bank retry.
    if (phase === 'finished') {
      await atomic('.ready', { assets: count, updatedAt: clock() });
      ready = true;
    }
    await atomic('.progress.json', { count, target: ASSETS_PER_MATCH, phase, ready, attemptStartedAt, updatedAt: clock() });
    return { count, ready, complete: count === ASSETS_PER_MATCH };
  };
}
