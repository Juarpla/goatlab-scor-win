/** Read-only scheduler gate: public evidence only, with no provider or storage calls. */
import { readFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { topFreshness, effectiveIds, defaultTopN } from '../src/lib/top.js';
import { bankComplete, contentFingerprint } from '../src/lib/media-contract.js';
import { contentIdentityErrors, scriptStructureErrors, validateContent } from '../src/lib/match-content.js';

const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
async function json(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return null; }
}
function options(args) {
  if (args instanceof Map) return Object.fromEntries(args);
  if (!Array.isArray(args)) return args ?? {};
  return Object.fromEntries(args.map(arg => {
    const i = arg.indexOf('=');
    return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)];
  }));
}
function inputEvidence(bank, images, videos, imageModel, videoModel, mode, matchId) {
  // Photos can be adopted in a different order; their canonical IDs identify the prompt slot.
  for (const photo of bank.assets) {
    const ordinal = images.prompts.findIndex((_, index) => photo.id === `${matchId}-${index}`);
    if (ordinal < 0 || photo.promptHash !== hash(images.prompts[ordinal].prompt)
      || (photo.model ?? photo.generated?.model) !== imageModel || photo.generated?.model !== imageModel) return false;
  }
  if (mode === 'images-only') return true;
  for (const clip of bank.clips) {
    const prefix = `${matchId}-clip-`;
    const suffix = clip.id.startsWith(prefix) ? clip.id.slice(prefix.length) : '';
    if (!/^[0-4]$/.test(suffix)) return false;
    const ordinal = Number(suffix), file = `clip-${ordinal}.mp4`;
    if ((clip.file !== undefined && clip.file !== file) || new URL(clip.url).pathname.split('/').at(-1) !== file
      || clip.promptHash !== hash(videos.prompts[ordinal % videos.prompts.length].prompt) || clip.model !== videoModel) return false;
  }
  return true;
}

export async function checkMediaComplete({ repo = process.cwd(), args = {}, env = process.env, now = Date.now() } = {}) {
  args = options(args);
  const data = join(repo, 'public/data');
  const bankDirectory = args['--out'] || env.MEDIA_PACK_DIR || join(data, 'media-pack');
  let top = null;
  try { top = JSON.parse(await readFile(join(data, 'top.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') top = {}; }
  const freshness = topFreshness(top, { now, env, manual: !!args['--match'] });
  const result = { complete: false, reason: '', eligible: 0, pending: 0, top_age_h: freshness.ageHours, top_stale: freshness.stale, exitCode: 0 };
  if (!freshness.valid) return { ...result, reason: `top-${freshness.reason}`, exitCode: 2 };
  const fixtures = await json(join(data, 'fixtures.json'));
  if (!fixtures || !Array.isArray(fixtures.matches)) return { ...result, reason: 'fixtures-invalid', exitCode: 2 };
  let matches;
  const requested = args['--match'];
  if (requested) {
    if (!safeId(requested)) return { ...result, reason: 'match-invalid', pending: 1 };
    matches = fixtures.matches.filter(match => match?.id === requested || match?.webId === requested);
    if (!matches.length) {
      const script = await json(join(data, 'youtube-scripts', `${requested}.json`));
      if (!scriptStructureErrors(script, { matchId: requested }).length) {
        matches = [{ id: requested, webId: requested, home: script.home, away: script.away, competition: script.competition, kickoff: script.kickoff }];
      }
    }
    if (!matches.length) return { ...result, reason: 'match-unavailable', pending: 1 };
  } else {
    const wanted = new Set(effectiveIds(top, defaultTopN(env)));
    matches = fixtures.matches.filter(match => match?.status === 'NS' && Date.parse(match.kickoff) > now && wanted.has(match.webId ?? match.id))
      .sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)));
    const limit = Number(args['--limit']);
    if (args['--limit'] != null && Number.isFinite(limit) && limit >= 1) matches = matches.slice(0, Math.floor(limit));
  }
  const mode = env.AGNES_SKIP_IMAGES === '1' ? 'clips-only' : env.AGNES_SKIP_VIDEO === '1' ? 'images-only' : 'all';
  const imageModel = env.AGNES_IMAGE_MODEL || 'agnes-image-2.5-flash';
  const videoModel = 'agnes-video-2.5-flash';
  // Duplicate fixture rows do not turn one bank into multiple obligations.
  for (const match of new Map(matches.map(value => [value?.webId ?? value?.id, value])).values()) {
    result.eligible += 1;
    const matchId = match?.webId ?? match?.id;
    if (!safeId(matchId)) { result.pending += 1; continue; }
    const [script, images, videos, bank] = await Promise.all([
      json(join(data, 'youtube-scripts', `${matchId}.json`)),
      json(join(data, 'image-prompts', `${matchId}.json`)),
      json(join(data, 'video-prompts', `${matchId}.json`)),
      json(join(bankDirectory, `${matchId}.json`)),
    ]);
    const validPack = (pack, category) => validateContent(pack, category, matchId) && !contentIdentityErrors(pack, match).length;
    const fingerprint = contentFingerprint(match, { ...images, generationModel: imageModel }, { ...videos, generationModel: videoModel });
    // An explicitly limited mode certifies its subset, while the stored full-bank status stays partial.
    const candidate = mode !== 'all' && bank?.bankStatus === 'partial' ? { ...bank, bankStatus: 'complete' } : bank;
    if (scriptStructureErrors(script, { matchId, match }).length || !validPack(images, 'image-prompts') || !validPack(videos, 'video-prompts')
      || !bankComplete(candidate, { matchId, fingerprint, mode, now }) || !inputEvidence(candidate, images, videos, imageModel, videoModel, mode, matchId)) result.pending += 1;
  }
  result.complete = result.pending === 0;
  result.reason = !result.eligible ? 'no-eligible' : result.complete ? 'complete' : 'pending';
  return result;
}

export function mediaCheckOutput(result) {
  return ['complete', 'reason', 'eligible', 'pending', 'top_age_h', 'top_stale']
    .map(key => `${key}=${result[key] ?? ''}`).join('\n') + '\n';
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkMediaComplete({ repo: process.env.GOATLAB_REPO || process.cwd(), args: process.argv.slice(2) });
  const output = mediaCheckOutput(result);
  process.stdout.write(output);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, output);
  process.exitCode = result.exitCode;
}
