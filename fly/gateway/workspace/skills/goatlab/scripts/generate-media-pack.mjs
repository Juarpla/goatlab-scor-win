/** One ephemeral run budget; durable provider admission and verified R2 publication. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile, rm, rename, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { assetErrors } from '../lib/media.js';
import { normalizeAgnesImage } from '../lib/agnes.js';
import { editingFacts } from '../lib/match-facts.js';
import { validateContent, contentIdentityErrors, scriptStructureErrors } from '../lib/match-content.js';
import { mediaPublisher } from '../lib/media-progress.js';
import { contentFingerprint } from '../lib/media-contract.js';
import { TOP_FILENAME, topFreshness, defaultTopN, effectiveIds, registerExtra } from '../lib/top.js';
import { transact } from './agnes-state.mjs';
import { maintainMedia } from './maintain-media.mjs';

const execute = promisify(execFile);
const PIPELINE = fileURLToPath(new URL('./', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const digest = value => /^[a-f0-9]{64}$/.test(value ?? '');
const json = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } };
export const parseMediaArgs = values => Object.fromEntries(values.map(arg => { const index = arg.indexOf('='); return index < 0 ? [arg, true] : [arg.slice(0, index), arg.slice(index + 1)]; }));
export function mediaRunDeadline(start, env = process.env) {
  const budget = env.MEDIA_RUN_BUDGET_MS === undefined ? 3_000_000 : Number(env.MEDIA_RUN_BUDGET_MS);
  if (!Number.isFinite(budget) || budget < 0) throw new Error('MEDIA_RUN_BUDGET_MS inválido');
  return start + budget;
}
export function mediaSoftStop(runDeadline, kickoff) {
  const at = Date.parse(kickoff);
  return Number.isFinite(at) ? Math.min(runDeadline, at + 86_400_000) : 0;
}

export async function generateMediaBanks({ args = {}, env = process.env, clock = Date.now, execImpl = execute, fetchImpl = fetch, transactImpl = transact, maintainImpl = maintainMedia, log = console.log } = {}) {
  const started = clock(), runDeadline = mediaRunDeadline(started, env), runId = randomUUID();
  const repo = env.GOATLAB_REPO || '.', dir = args['--out'] || env.MEDIA_PACK_DIR || join(repo, 'public/data/media-pack');
  const r2tool = join(repo, 'scripts/r2-media.mjs');
  const R2 = env.R2_PUBLIC_BASE && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && (env.R2_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID)
    ? { base: env.R2_PUBLIC_BASE.replace(/\/$/, '') } : null;
  const base = R2 ? R2.base + '/partidos' : (env.MEDIA_GEN_BASE || 'https://goatlab-gateway.fly.dev/media-gen').replace(/\/$/, '');
  const operations = { media: { opsA: 0, opsB: 0 }, control: { opsA: 0, opsB: 0 } };
  const addOperations = value => { for (const group of ['media', 'control']) for (const key of ['opsA', 'opsB']) operations[group][key] += Number(value?.[group]?.[key]) || 0; };
  const state = async (op, input) => {
    try { const result = await transactImpl(op, input, { env }); addOperations(result.operations); return result; }
    catch (error) { addOperations(error.operations); throw error; }
  };
  const r2 = async (cmd, ...values) => {
    if (!R2 && cmd !== 'record') return null;
    try {
      const { stdout } = await execImpl(process.execPath, [r2tool, cmd, ...values], { cwd: repo, env: { ...env, R2_NO_DOTENV: '1', R2_LEDGER: join(repo, 'public/data/r2-usage.json') }, maxBuffer: 8 * 1024 * 1024 });
      const result = JSON.parse(stdout);
      if (cmd !== 'record') addOperations(result.operations);
      return result;
    } catch { return null; }
  };
  const download = async (url, file, limit) => {
    try {
      operations.media.opsB++;
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok || Number(response.headers.get('content-length') || 0) > limit) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > limit) return null;
      await writeFile(file, bytes);
      return bytes;
    } catch { return null; }
  };
  const fixtures = await json(join(repo, 'public/data/fixtures.json'));
  await mkdir(dir, { recursive: true });
  const maintenance = await maintainImpl({ repo, dir, protectedMatch: args['--match'], now: clock(), transactImpl: state,
    r2Impl: prefix => r2('del-prefix', prefix) });
  const topDefault = defaultTopN(env);
  let top = await json(join(repo, 'public/data', TOP_FILENAME));
  const freshness = topFreshness(top, { now: clock(), env, manual: !!args['--match'] });
  if (!freshness.valid) throw new Error('Top no disponible: ' + freshness.reason);
  let matches;
  if (args['--match']) {
    matches = (fixtures?.matches ?? []).filter(m => m.id === args['--match'] || m.webId === args['--match']);
    if (!matches.length && ID.test(args['--match'])) {
      const script = await json(join(repo, 'public/data/youtube-scripts', args['--match'] + '.json'));
      if (!scriptStructureErrors(script, { matchId: args['--match'] }).length) matches = [{ id: args['--match'], webId: args['--match'], home: script.home, away: script.away, competition: script.competition, kickoff: script.kickoff }];
    }
    if (matches.length && !args['--content']) {
      const registered = registerExtra(top ?? { ranking: [], extra: [] }, matches.map(m => m.webId ?? m.id));
      if (registered.added.length) { top = registered.top; await writeFile(join(repo, 'public/data', TOP_FILENAME), JSON.stringify(top, null, 2)); }
    }
  } else {
    const wanted = new Set(effectiveIds(top, topDefault));
    matches = (fixtures?.matches ?? []).filter(m => wanted.has(m.webId ?? m.id) && m.status === 'NS' && Date.parse(m.kickoff) > clock()).sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)));
    if (args['--limit'] != null) matches = matches.slice(0, Math.max(1, Number(args['--limit'])));
  }
  const snapshot = args['--content'] ? await json(args['--content']) : {};
  const mode = env.AGNES_SKIP_IMAGES === '1' ? 'clips-only' : env.AGNES_SKIP_VIDEO === '1' ? 'images-only' : 'all';
  const summary = { runId, eligible: 0, pending: 0, generated: 0, reused: 0, completed: 0, completedIds: [], deletedIds: maintenance.deletedIds ?? [] };
  const budget = R2 ? await r2('budget') : null;
  const r2blocked = !R2 || !budget || budget.level === 'block';
  for (const match of matches) {
    const matchId = match.webId ?? match.id;
    if (!ID.test(matchId)) continue;
    const pack = async category => snapshot?.[category] ?? await json(join(repo, 'public/data', category, matchId + '.json'));
    const imagePack = await pack('image-prompts'), videoPack = await pack('video-prompts'), motionPack = await pack('motion-prompts');
    const validPack = (pack, category) => validateContent(pack, category, matchId) && !contentIdentityErrors(pack, match).length;
    const imagePrompts = validPack(imagePack, 'image-prompts') ? imagePack.prompts : [];
    const videoPrompts = validPack(videoPack, 'video-prompts') ? videoPack.prompts : [];
    const motionPrompts = validPack(motionPack, 'motion-prompts') ? motionPack.prompts : [];
    const script = await json(join(repo, 'public/data/youtube-scripts', matchId + '.json'));
    if (!args['--match'] && (scriptStructureErrors(script, { matchId, match }).length || !imagePrompts.length || !videoPrompts.length)) { log('media: ' + matchId + ': sin guión o prompts válidos; omitido'); continue; }
    summary.eligible++;
    const folder = join(dir, 'gen', matchId); await mkdir(folder, { recursive: true });
    const prev = await json(join(dir, matchId + '.json'));
    const scorers = await json(join(repo, 'public/data/scorers.json'));
    const facts = motionPrompts.length ? motionPack.facts : editingFacts(match, scorers);
    const deadline = mediaSoftStop(runDeadline, match.kickoff), expiresAt = (Date.parse(match.kickoff) + 86_400_000) / 1000;
    const imageModel = env.AGNES_IMAGE_MODEL || 'agnes-image-2.5-flash', videoModel = 'agnes-video-2.5-flash';
    const fingerprint = contentFingerprint(match, { ...imagePack, generationModel: imageModel }, { ...videoPack, generationModel: videoModel });
    const failures = [];
    if (!imagePrompts.length) failures.push('Image Prompts no disponibles');
    if (!videoPrompts.length) failures.push('Video Prompts no disponibles');
    if (!motionPrompts.length) failures.push('Motion Prompts no disponibles; montaje local disponible');
    if (!Number.isFinite(Date.parse(match.kickoff))) failures.push('Kickoff inválido; solo reutilización');
    if (!env.AGNES_API_KEY?.trim()) failures.push('falta AGNES_API_KEY');
    if (r2blocked) failures.push('R2: subidas y generación pausadas; reutilización disponible');
    let authorityReady = true;
    try { await state('heartbeat', { runId, matchId }); } catch { authorityReady = false; failures.push('Estado privado no disponible; generación cerrada'); }
    const heartbeat = setInterval(() => { state('heartbeat', { runId, matchId }).catch(() => { authorityReady = false; }); }, 30_000); heartbeat.unref();
    const assets = [], clips = [], verifiedAssets = new Set(), verifiedClips = new Set();
    const publish = mediaPublisher({ dir, match, facts, prior: prev, draft: env.MEDIA_DRAFT === '1', clock: () => new Date(clock()).toISOString() });
    const extras = () => ({ clips, motionPrompts, failures, contentVersion: 1, bankVersion: 2, contentFingerprint: fingerprint, mode,
      storageVerifiedAt: new Date(clock()).toISOString(), verifiedAssets: [...verifiedAssets], verifiedClips: [...verifiedClips] });
    const putResource = async (kind, ordinal, saved, object) => {
      if (!R2 || r2blocked) return false;
      try {
        const bytes = await readFile(join(folder, saved.file)), sha256 = hash(bytes);
        const status = await state('status', { matchId, kind, ordinal });
        const slot = status.slot;
        if (!slot || slot.state !== 'completed' || slot.promptHash !== object.promptHash || slot.model !== object.model || (kind === 'video' && slot.referenceHash !== object.referenceHash)) return false;
        const claimId = slot.uploadClaim?.sha256 === sha256 ? slot.uploadClaim.id : 'upload-' + sha256;
        const claim = await state('uploadclaim', { matchId, kind, ordinal, claimId, sha256 });
        if (!claim.canPut) return false;
        const mime = kind === 'video' ? 'video/mp4' : saved.file.endsWith('.png') ? 'image/png' : saved.file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        const values = ['model=' + object.model, 'prompthash=' + object.promptHash, 'sha256=' + sha256, 'width=' + object.width, 'height=' + object.height];
        if (kind === 'video') values.push('referencehash=' + object.referenceHash, 'duration=' + object.duration);
        if (!(await r2('put', join(folder, saved.file), 'partidos/' + matchId + '/' + saved.file, mime, ...values))) return false;
        await state('uploadconfirm', { matchId, kind, ordinal, claimId, sha256 });
        return true;
      } catch { return false; }
    };
    try {
      const guardFile = join(folder, 'guard.json'), operationsFile = join(folder, 'operations-' + runId + '.jsonl');
      await writeFile(guardFile, JSON.stringify(match));
      const childEnv = { ...env, GOATLAB_REPO: repo, AGNES_STATE_DB: env.AGNES_STATE_DB || join(dir, 'agnes.sqlite'), AGNES_RUN_ID: runId,
        AGNES_MANUAL: args['--match'] ? '1' : '0', AGNES_GUARD_FILE: guardFile, AGNES_OPERATIONS_FILE: operationsFile };
      for (let ordinal = 0; ordinal < 4; ordinal++) {
        const desired = imagePrompts[ordinal]?.prompt;
        const prior = prev?.assets?.find(a => a.id === matchId + '-' + ordinal && a.source === 'agnes');
        const saved = await json(join(folder, ordinal + '.json'));
        let local = saved && (!desired || saved.prompt === desired) && saved.model === imageModel ? saved : prior && (!desired || prior.query === desired) && (prior.model || prior.generated?.model) === imageModel ? { ...prior, model: prior.model || prior.generated?.model, prompt: prior.query, file: new URL(prior.url).pathname.split('/').at(-1) } : null;
        for (const ext of ['jpg', 'png', 'webp']) {
          const file = ordinal + '.' + ext, path = join(folder, file);
          const found = await r2('exists', 'partidos/' + matchId + '/' + file);
          const remote = found?.found, meta = remote && typeof remote === 'object' ? remote.meta ?? {} : {};
          if (!remote && local?.file !== file) continue;
          const prompt = meta.prompthash === hash(desired || '') ? desired : meta.prompt === desired ? meta.prompt : local?.prompt;
          const model = meta.model || local?.model;
          if ((desired && prompt !== desired) || model !== imageModel || (!prompt && !local)) continue;
          let bytes; try { bytes = await readFile(path); } catch {}
          if (remote && (!bytes || !digest(meta.sha256) || hash(bytes) !== meta.sha256)) bytes = await download(R2.base + '/partidos/' + encodeURIComponent(matchId) + '/' + file, path, 64_000_000);
          if (!bytes) continue;
          const sha256 = hash(bytes);
          if (digest(meta.sha256) && sha256 !== meta.sha256) continue;
          const asset = { ...normalizeAgnesImage({ matchId, index: ordinal, publicUrl: base + '/' + encodeURIComponent(matchId) + '/' + file, model, prompt,
            at: meta.at || local?.at || prior?.generatedAt }), width: Number(meta.width || local?.width), height: Number(meta.height || local?.height),
            model, promptHash: hash(prompt || ''), sha256, prepared: true };
          if (assetErrors(asset).length) continue;
          assets.push(asset); summary.reused++;
          if (remote || await putResource('image', ordinal, { file }, asset)) verifiedAssets.add(asset.id);
          break;
        }
      }
      for (let ordinal = 0; ordinal < 5 && clips.length < 2; ordinal++) {
        const file = 'clip-' + ordinal + '.mp4', path = join(folder, file), desired = videoPrompts[ordinal % Math.max(1, videoPrompts.length)]?.prompt;
        const prior = prev?.clips?.find(c => c.file === file && c.source === 'agnes');
        const saved = await json(join(folder, 'clip-' + ordinal + '.json'));
        const local = saved && saved.prompt === desired && saved.model === videoModel ? saved : prior;
        const found = await r2('exists', 'partidos/' + matchId + '/' + file), remote = found?.found;
        const meta = remote && typeof remote === 'object' ? remote.meta ?? {} : {};
        const promptHash = meta.prompthash || local?.promptHash || (local?.prompt ? hash(local.prompt) : null);
        const referenceHash = meta.referencehash || local?.referenceHash || (local?.reference ? hash(local.reference) : null);
        if (!desired || promptHash !== hash(desired) || !digest(referenceHash) || !assets.some(a => hash(a.url) === referenceHash)) continue;
        let bytes; try { bytes = await readFile(path); } catch {}
        if (remote && (!bytes || !digest(meta.sha256) || hash(bytes) !== meta.sha256)) bytes = await download(R2.base + '/partidos/' + encodeURIComponent(matchId) + '/' + file, path, 32_000_000);
        if (!bytes || (digest(meta.sha256) && hash(bytes) !== meta.sha256)) continue;
        const clip = { id: matchId + '-clip-' + ordinal, source: 'agnes', file, url: base + '/' + encodeURIComponent(matchId) + '/' + file,
          width: Number(meta.width || local?.width), height: Number(meta.height || local?.height), duration: Number(meta.duration || local?.duration),
          model: meta.model || local?.model, promptHash, referenceHash, sha256: hash(bytes) };
        if (clip.model !== videoModel || clip.width !== 720 || clip.height !== 1280 || !Number.isFinite(clip.duration) || clip.duration < 4 || clip.duration > 12.5) continue;
        clips.push(clip); summary.reused++;
        if (remote || await putResource('video', ordinal, { file }, clip)) verifiedClips.add(clip.id);
      }
      await publish(assets, 'generating', extras());
      const canGenerate = () => !!fingerprint && authorityReady && !!env.AGNES_API_KEY?.trim() && !r2blocked && deadline > clock()
        && (!!args['--match'] || (match.status === 'NS' && Date.parse(match.kickoff) > clock()));
      if (canGenerate() && env.AGNES_SKIP_IMAGES !== '1') for (const [ordinal, row] of imagePrompts.entries()) {
        if (assets.some(a => a.id === matchId + '-' + ordinal)) continue;
        const timeout = Number(env.AGNES_TIMEOUT_SECONDS || 300);
        if (clock() + timeout * 1000 + 35_000 > deadline) { failures.push('Imágenes: presupuesto de corrida agotado'); break; }
        const promptFile = join(folder, ordinal + '.prompt.txt'); await writeFile(promptFile, row.prompt);
        try {
          const { stdout } = await execImpl(env.PYTHON_BIN || 'python3', [join(PIPELINE, 'agnes.py'), '--match=' + matchId, '--index=' + ordinal,
            '--expires-at=' + expiresAt, '--attempt-deadline=' + deadline / 1000, '--prompt-file=' + promptFile, '--out=' + folder],
          { env: childEnv, timeout: Math.max(1, deadline - clock()), maxBuffer: 1024 * 1024 });
          const saved = JSON.parse(stdout);
          if (saved.prompt !== row.prompt || saved.model !== imageModel || !/^[0-3]\.(jpg|png|webp)$/.test(saved.file)) throw new Error('Resultado incompatible');
          const bytes = await readFile(join(folder, saved.file));
          const asset = { ...normalizeAgnesImage({ matchId, index: ordinal, publicUrl: base + '/' + encodeURIComponent(matchId) + '/' + saved.file,
            model: saved.model, prompt: saved.prompt, at: saved.at }), model: saved.model, width: saved.width, height: saved.height, prepared: true, promptHash: hash(saved.prompt), sha256: hash(bytes) };
          if (assetErrors(asset).length) throw new Error('Imagen inválida');
          assets.push(asset); summary.generated++;
          if (await putResource('image', ordinal, saved, asset)) verifiedAssets.add(asset.id); else failures.push('R2: subida de imagen sin confirmar');
          await publish(assets, 'generating', extras());
        } catch (error) { const reason = String(error.stderr || error.message).trim().slice(0, 180); failures.push('Imagen ' + (ordinal + 1) + ': ' + reason); if (/429|incierto|pausado|cuota/.test(reason)) break; }
      }
      await publish(assets, 'generating-clips', extras());
      if (canGenerate() && env.AGNES_SKIP_VIDEO !== '1' && videoPrompts.length && assets.length && clips.length < 2) {
        const input = join(folder, 'video-input.json'); await writeFile(input, JSON.stringify({ matchId, prompts: videoPrompts, images: assets, deadline: deadline / 1000, expiresAt }));
        try {
          const { stdout } = await execImpl(env.PYTHON_BIN || 'python3', [join(PIPELINE, 'agnes_video.py'), '--input=' + input, '--out=' + folder],
            { env: childEnv, timeout: Math.max(1, deadline - clock() + 500), maxBuffer: 1024 * 1024 });
          const result = JSON.parse(stdout); failures.push(...(result.failures ?? []));
          for (const saved of result.clips ?? []) {
            if (clips.some(c => c.file === saved.file) || clips.length >= 2 || !/^clip-[0-4]\.mp4$/.test(saved.file)) continue;
            const bytes = await readFile(join(folder, saved.file));
            const clip = { id: matchId + '-clip-' + saved.index, source: 'agnes', file: saved.file, url: base + '/' + encodeURIComponent(matchId) + '/' + saved.file,
              width: saved.width, height: saved.height, duration: saved.duration, model: saved.model || videoModel, promptHash: saved.promptHash || hash(saved.prompt),
              referenceHash: saved.referenceHash || hash(saved.reference), sha256: hash(bytes) };
            const ordinal = Number(saved.file.match(/^clip-([0-4])\.mp4$/)[1]);
            if (saved.index !== ordinal || clip.model !== videoModel || clip.promptHash !== hash(videoPrompts[ordinal % videoPrompts.length].prompt)
              || !assets.some(asset => hash(asset.url) === clip.referenceHash) || clip.width !== 720 || clip.height !== 1280
              || !Number.isFinite(clip.duration) || clip.duration < 4 || clip.duration > 12.5) {
              failures.push('Clip recuperado de otra identidad; conservado sin publicar'); continue;
            }
            clips.push(clip); summary.generated++;
            if (await putResource('video', saved.index, saved, clip)) verifiedClips.add(clip.id); else failures.push('R2: subida de clip sin confirmar');
          }
        } catch (error) { failures.push('Clips: ' + String(error.stderr || error.message).slice(0, 180)); }
      }
      const result = await publish(assets, 'finished', extras());
      if (result.complete) { summary.completed++; summary.completedIds.push(matchId); } else summary.pending++;
      try { for (const line of (await readFile(operationsFile, 'utf8')).split('\n').filter(Boolean)) addOperations(JSON.parse(line)); } catch {}
      await rm(operationsFile, { force: true });
      log('media: ' + matchId + ': ' + assets.length + '/4 imágenes, ' + clips.length + '/2 clips; ' + failures.join('; '));
    } finally { clearInterval(heartbeat); try { await state('heartbeat', { runId, finished: true }); } catch {} }
  }
  try { await state('run-summary', Object.fromEntries(['runId', 'eligible', 'pending', 'generated', 'reused', 'completed'].map(key => [key, summary[key]]))); } catch {}
  if (R2) await r2('record', String(operations.media.opsA), String(operations.media.opsB), String(operations.control.opsA), String(operations.control.opsB));
  const publication = { allow_commit: summary.completedIds.length > 0 || summary.deletedIds.length > 0,
    complete_ids: summary.completedIds, deleted_ids: summary.deletedIds, generated: summary.generated };
  await mkdir(join(repo, '.cache'), { recursive: true });
  const publicationPath = join(repo, '.cache/media-publication.json'), temporary = publicationPath + '.' + runId + '.tmp';
  await writeFile(temporary, JSON.stringify(publication));
  await rename(temporary, publicationPath);
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, 'allow_commit=' + publication.allow_commit + '\ncomplete_ids=' + JSON.stringify(publication.complete_ids) + '\ndeleted_ids=' + JSON.stringify(publication.deleted_ids) + '\n');
  return { ...summary, operations };
}

export async function runMediaCli() {
  try { const result = await generateMediaBanks({ args: parseMediaArgs(process.argv.slice(2)) }); console.log(JSON.stringify(result)); }
  catch (error) { console.error('media: ' + String(error.message).slice(0, 240)); process.exitCode = 2; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await runMediaCli();
