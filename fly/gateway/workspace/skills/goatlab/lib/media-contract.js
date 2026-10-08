/** Public bank evidence; callers establish storage proofs before publishing. */
import { createHash } from 'node:crypto';
import { esName } from './teams.js';
import { assetErrors } from './media.js';
import { contentIdentityErrors } from './match-content.js';

const sha = value => createHash('sha256').update(value).digest('hex');
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
const time = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN;
const https = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
};
const distinct = (resources, key) => new Set(resources.map(resource => resource[key])).size === resources.length;
const validPhotos = photos => Array.isArray(photos) && photos.length <= 4
  && photos.every(photo => !assetErrors(photo).length && safeId(photo.id) && https(photo.url) && hash(photo.sha256)
    && Number.isInteger(photo.width) && photo.width > 0 && Number.isInteger(photo.height) && photo.height > 0)
  && ['id', 'url', 'sha256'].every(key => distinct(photos, key));

/** Motion, author, generation dates and editorial titles do not affect Agnes input. */
export function contentFingerprint(match, imagePack, videoPack) {
  const matchId = match?.webId ?? match?.id;
  const kickoff = time(match?.kickoff);
  if (!safeId(matchId) || typeof match?.home !== 'string' || !match.home.trim() || typeof match?.away !== 'string' || !match.away.trim()
    || typeof match?.competition !== 'string' || !match.competition.trim() || !Number.isFinite(kickoff)) return null;
  const identity = { matchId, home: esName(match.home), away: esName(match.away), competition: match.competition, kickoff: new Date(kickoff).toISOString() };
  const inputs = [];
  for (const [category, pack, count, fallback] of [
    ['image-prompts', imagePack, 4, 'agnes-image-2.5-flash'],
    ['video-prompts', videoPack, 2, 'agnes-video-2.5-flash'],
  ]) {
    if (!pack || pack.version !== 1 || pack.category !== category || contentIdentityErrors(pack, match).length
      || !Array.isArray(pack.prompts) || pack.prompts.length !== count
      || pack.prompts.some((row, index) => row?.n !== index + 1 || typeof row.prompt !== 'string' || !row.prompt.trim())) return null;
    const model = pack.generationModel ?? pack.model ?? fallback;
    if (typeof model !== 'string' || !model.trim()) return null;
    inputs.push({ category, model, prompts: pack.prompts.map(row => row.prompt) });
  }
  return sha(JSON.stringify({ version: 2, identity, inputs }));
}

/** Count alone never certifies a bank; fingerprints and storage/media evidence do. */
export function bankComplete(bank, { matchId, fingerprint, mode = 'all', now = Date.now() } = {}) {
  if (!bank || bank.bankVersion !== 2 || bank.bankStatus !== 'complete' || !safeId(matchId) || bank.matchId !== matchId
    || !hash(fingerprint) || bank.contentFingerprint !== fingerprint || !Number.isFinite(now)
    || !['all', 'images-only', 'clips-only'].includes(mode)) return false;
  const verifiedAt = time(bank.storageVerifiedAt);
  if (!Number.isFinite(verifiedAt) || verifiedAt > now) return false;
  const photos = bank.assets, clips = bank.clips;
  if (!validPhotos(photos) || !Array.isArray(clips) || clips.length > 2) return false;
  if (mode !== 'clips-only' && photos.length !== 4) return false;
  if (mode !== 'images-only' && clips.length !== 2) return false;
  const references = new Set(photos.map(photo => sha(photo.url)));
  return clips.every(clip => clip?.source === 'agnes' && safeId(clip.id) && https(clip.url) && hash(clip.sha256)
    && typeof clip.model === 'string' && !!clip.model.trim() && clip.width === 720 && clip.height === 1280
    && Number.isFinite(clip.duration) && clip.duration >= 4 && clip.duration <= 12.5
    && hash(clip.promptHash) && hash(clip.referenceHash) && references.has(clip.referenceHash))
    && ['id', 'url', 'sha256'].every(key => distinct(clips, key));
}
