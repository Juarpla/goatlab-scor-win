import { mkdir, writeFile, rename, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { ASSETS_PER_MATCH, buildManifest, assetErrors } from './media.js';
import { checkMediaManifest } from './compliance.js';
import { bankComplete } from './media-contract.js';

/** Publish valid packs before the producer finishes; every file replaces atomically. */
export function mediaPublisher({ dir, match, facts = [], target = ASSETS_PER_MATCH, clock = () => new Date().toISOString(), draft = false, prior = null }) {
  const matchId = match.webId ?? match.id;
  let count = 0, ready = false;
  let priorLoaded = prior !== null;
  const atomic = async (name, value) => {
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${matchId}${name}`);
    const temporary = `${path}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, JSON.stringify(value)); await rename(temporary, path); }
    finally { await rm(temporary, { force: true }); }
  };
  return async (assets, phase, extra = {}) => {
    if (!priorLoaded) {
      try { prior = JSON.parse(await readFile(join(dir, `${matchId}.json`), 'utf8')); } catch { prior = null; }
      priorLoaded = true;
    }
    const { verifiedAssets, verifiedClips, attemptStartedAt: _oldAttempt, ...publicExtra } = extra;
    const generatedAt = clock();
    const payload = { ...buildManifest({ match, assets: [...new Map(assets.filter(a=>!assetErrors(a).length).map(a=>[`${a.source}:${a.id}`,a])).values()].slice(0, ASSETS_PER_MATCH) }), facts, generatedAt, ...publicExtra };
    count = payload.assets.length;
    const errors = checkMediaManifest(payload, { matchId });
    if (errors.length) throw new Error(`manifiesto inválido: ${errors.join('; ')}`);
    const assetProof = new Set(Array.isArray(verifiedAssets) || verifiedAssets instanceof Set ? verifiedAssets : []);
    const clipProof = new Set(Array.isArray(verifiedClips) || verifiedClips instanceof Set ? verifiedClips : []);
    const candidate = { ...payload, bankStatus: 'complete' };
    const complete = bankComplete(candidate, { matchId, fingerprint: candidate.contentFingerprint, now: Date.parse(generatedAt) })
      && payload.assets.every(asset => assetProof.has(asset.id)) && (payload.clips ?? []).every(clip => clipProof.has(clip.id));
    const preserve = prior?.bankStatus === 'complete' && !complete;
    const publishable = complete || (!draft && !preserve);
    if (publishable) {
      await atomic('.json', { ...payload, bankStatus: complete ? 'complete' : phase === 'finished' ? 'partial' : 'preparing' });
      if (complete) prior = candidate;
    }
    // Fly can finish with a graphics montage; hourly drafts wait for a proven bank.
    if ((complete || (phase === 'finished' && !draft)) && !preserve) {
      await atomic('.ready', { assets: count, updatedAt: generatedAt });
      ready = true;
    }
    if (preserve) ready = true;
    await atomic('.progress.json', { count, target, clips: payload.clips?.length ?? 0, failures: payload.failures ?? [], phase, ready, complete, updatedAt: generatedAt });
    return { count, ready, complete, publishable };
  };
}
