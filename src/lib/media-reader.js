/** Read-only R2 inventory for Gateway. No provider, quota or remote-write dependencies. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, readdir, stat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { signR2 } from './r2-signed.js';
import { ASSETS_PER_MATCH, CLIPS_PER_MATCH, assetErrors, buildManifest } from './media.js';
import { normalizeAgnesImage } from './agnes.js';
import { validateContent, contentIdentityErrors } from './match-content.js';
import { contentFingerprint, bankComplete } from './media-contract.js';
import { editingFacts } from './match-facts.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => /^[a-f0-9]{64}$/.test(value ?? '');
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const read = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } };
async function atomic(path, value) {
  const temp = path + '.' + randomUUID() + '.tmp';
  try { await writeFile(temp, JSON.stringify(value)); await rename(temp, path); }
  finally { await rm(temp, { force: true }); }
}
async function cacheBytes(dir) {
  let total = 0;
  for (const file of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, file.name);
    total += file.isDirectory() ? await cacheBytes(path) : (await stat(path)).size;
  }
  return total;
}

export async function readMediaBank({ match, content = {}, dir, env = process.env, fetchImpl = fetch, clock = Date.now }) {
  const matchId = match?.webId ?? match?.matchId ?? match?.id;
  if (!ID.test(matchId ?? '')) throw new Error('partido inválido');
  match = { ...match, webId: matchId };
  await mkdir(dir, { recursive: true });
  const prior = await read(join(dir, matchId + '.json'));
  const folder = join(dir, 'gen', matchId);
  await mkdir(folder, { recursive: true });
  const issues = [], assets = [], clips = [];
  const deadline = clock() + 90_000;
  const base = (env.R2_PUBLIC_BASE || env.MEDIA_GEN_BASE || '').replace(/\/$/, '');
  const fingerprint = contentFingerprint(match, content['image-prompts'], content['video-prompts']);
  const validPack = category => validateContent(content[category], category, matchId) && !contentIdentityErrors(content[category], match).length;
  const imagePrompts = validPack('image-prompts') ? content['image-prompts'].prompts : [];
  const videoPrompts = validPack('video-prompts') ? content['video-prompts'].prompts : [];
  const motionPack = validPack('motion-prompts') ? content['motion-prompts'] : null;
  const compatible = fingerprint && prior?.matchId === matchId && prior?.contentFingerprint === fingerprint;
  const startedProgress = { count: compatible ? prior.assets?.length ?? 0 : 0, clips: compatible ? prior.clips?.length ?? 0 : 0,
    target: ASSETS_PER_MATCH, phase: 'consulting', readerVersion: 1, updatedAt: new Date(clock()).toISOString() };
  await atomic(join(dir, matchId + '.progress.json'), startedProgress);
  let allocated = await cacheBytes(join(dir, 'gen'));
  const legacyArtifacts = Boolean(prior?.legacyArtifacts || (prior && prior.readerVersion !== 1));
  const issue = (kind, ordinal, code, httpStatus = null) => issues.push({ kind, ordinal, code, httpStatus });
  const publicUrl = file => `${base}/partidos/${encodeURIComponent(matchId)}/${file}`;
  const timeout = max => {
    const remaining = deadline - clock();
    if (remaining <= 0) throw new Error('deadline');
    return AbortSignal.timeout(Math.max(1, Math.min(max, remaining)));
  };
  const head = async file => {
    const key = `partidos/${matchId}/${file}`;
    const account = env.R2_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID;
    const signed = account && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
      ? signR2({ method: 'HEAD', key, bucket: env.R2_BUCKET || 'goatlab', account, access: env.R2_ACCESS_KEY_ID, secret: env.R2_SECRET_ACCESS_KEY })
      : { url: publicUrl(file), headers: {} };
    const response = await fetchImpl(signed.url, { method: 'HEAD', headers: signed.headers, signal: timeout(10_000) });
    if (response.status === 404) return null;
    if (!response.ok) throw Object.assign(new Error('http'), { httpStatus: response.status });
    return Object.fromEntries([...response.headers].filter(([name]) => name.startsWith('x-amz-meta-')).map(([name, value]) => [name.slice(11), value]));
  };
  const cached = async (file, sha256) => {
    if (!digest(sha256)) return false;
    try {
      if ((await stat(join(folder, file))).size > 32_000_000) return false;
      const bytes = await readFile(join(folder, file));
      return hash(bytes) === sha256;
    } catch { return false; }
  };
  const download = async (file, meta, limit, type) => {
    // Check public access even when local bytes exist: Render consumes these URLs.
    const response = await fetchImpl(publicUrl(file), { signal: timeout(30_000), headers: { 'user-agent': 'goatlab-render/1.0 (https://goatlab.win)' } });
    if (!response.ok) throw Object.assign(new Error('http'), { httpStatus: response.status });
    const length = Number(response.headers.get('content-length'));
    if (!(response.headers.get('content-type') || '').startsWith(type) || length > limit || !digest(meta.sha256)) {
      await response.body?.cancel(); throw new Error('validation');
    }
    const temp = join(folder, file + '.download');
    let size = 0;
    const sha = createHash('sha256');
    const handle = await open(temp, 'w');
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > limit || allocated + size > 256_000_000) throw new Error('cache');
        sha.update(chunk); await handle.writeFile(chunk);
      }
      if (!size || sha.digest('hex') !== meta.sha256) throw new Error('validation');
      await handle.close();
      const oldSize = await stat(join(folder, file)).then(s => s.size).catch(() => 0);
      await rename(temp, join(folder, file)); allocated += size - oldSize;
    } finally { await handle.close(); await rm(temp, { force: true }); }
  };
  const retain = async (kind, ordinal, file, expectedPrompt, model) => {
    const rows = kind === 'image' ? prior?.assets : prior?.clips;
    const row = compatible && rows?.find(r => {
      try { return new URL(r.url).pathname.split('/').at(-1) === file; } catch { return false; }
    });
    if (!row || row.source !== 'agnes' || row.promptHash !== hash(expectedPrompt || '') || row.model !== model || !(await cached(file, row.sha256))) return;
    if (kind === 'image' && !assetErrors(row).length) assets.push(row);
    if (kind === 'video' && assets.some(a => hash(a.url) === row.referenceHash)) clips.push(row);
  };
  let configured = false;
  try { const url = new URL(base); configured = url.protocol === 'https:' && !url.username && !url.password; } catch {}
  if (!configured) issue('bank', 0, 'configuration');
  if (!imagePrompts.length || !videoPrompts.length) issue('bank', 0, 'prompts');
  if (!configured && compatible) {
    for (const [ordinal, row] of (prior.assets ?? []).slice(0, ASSETS_PER_MATCH).entries()) {
      try { await retain('image', ordinal, new URL(row.url).pathname.split('/').at(-1), row.query, row.model); } catch {}
    }
    for (const [ordinal, row] of (prior.clips ?? []).slice(0, CLIPS_PER_MATCH).entries()) {
      try { await retain('video', ordinal, row.file, videoPrompts[ordinal % videoPrompts.length]?.prompt, row.model); } catch {}
    }
  }
  if (configured) {
    for (let ordinal = 0; ordinal < Math.min(ASSETS_PER_MATCH, imagePrompts.length); ordinal++) {
      const prompt = imagePrompts[ordinal].prompt;
      const model = content['image-prompts'].generationModel ?? content['image-prompts'].model ?? 'agnes-image-2.5-flash';
      for (const ext of ['jpg', 'png', 'webp']) {
        const file = ordinal + '.' + ext;
        try {
          const meta = await head(file);
          if (!meta) continue;
          if (meta.prompthash !== hash(prompt) || meta.model !== model || !digest(meta.sha256) || !(Number(meta.width) > 0 && Number(meta.height) > 0)) throw new Error('validation');
          await download(file, meta, 16_000_000, 'image/');
          const old = compatible && prior.assets?.find(a => a.id === `${matchId}-${ordinal}`);
          const asset = { ...normalizeAgnesImage({ matchId, index: ordinal, publicUrl: publicUrl(file), model, prompt, at: meta.at || old?.generated?.at || new Date(clock()).toISOString() }),
            model, promptHash: meta.prompthash, sha256: meta.sha256, width: Number(meta.width), height: Number(meta.height), prepared: true };
          assets.push(asset); break;
        } catch (error) {
          issue('image', ordinal, error.httpStatus ? 'access' : ['validation', 'cache'].includes(error.message) ? error.message : 'connection', error.httpStatus);
          await retain('image', ordinal, file, prompt, model);
          if (assets.some(a => a.id === `${matchId}-${ordinal}`)) break;
        }
      }
    }
    for (let ordinal = 0; ordinal < 5 && clips.length < CLIPS_PER_MATCH && videoPrompts.length; ordinal++) {
      const file = `clip-${ordinal}.mp4`, prompt = videoPrompts[ordinal % videoPrompts.length].prompt;
      const model = content['video-prompts'].generationModel ?? content['video-prompts'].model ?? 'agnes-video-2.5-flash';
      try {
        const meta = await head(file);
        if (!meta) continue;
        if (meta.prompthash !== hash(prompt) || meta.model !== model || !digest(meta.sha256) || !assets.some(a => hash(a.url) === meta.referencehash)
          || Number(meta.width) !== 720 || Number(meta.height) !== 1280 || !Number.isFinite(Number(meta.duration)) || Number(meta.duration) < 4 || Number(meta.duration) > 12.5) throw new Error('validation');
        await download(file, meta, 32_000_000, 'video/');
        clips.push({ id: `${matchId}-clip-${ordinal}`, source: 'agnes', file, url: publicUrl(file), width: 720, height: 1280,
          duration: Number(meta.duration), model, promptHash: meta.prompthash, referenceHash: meta.referencehash, sha256: meta.sha256 });
      } catch (error) {
        issue('video', ordinal, error.httpStatus ? 'access' : ['validation', 'cache'].includes(error.message) ? error.message : 'connection', error.httpStatus);
        await retain('video', ordinal, file, prompt, model);
      }
    }
  }
  // Repeated or mismatched objects cannot inflate availability.
  const distinct = rows => rows.filter((row, i) => rows.findIndex(other => other.sha256 === row.sha256 || other.id === row.id) === i);
  const photos = distinct(assets), videos = distinct(clips).filter(clip => photos.some(photo => hash(photo.url) === clip.referenceHash));
  const bank = { ...buildManifest({ match, assets: photos }), clips: videos, facts: motionPack?.facts ?? editingFacts(match), motionPrompts: motionPack?.prompts ?? [],
    bankVersion: 2, bankStatus: 'complete', contentFingerprint: fingerprint, readerVersion: 1, legacyArtifacts,
    storageVerifiedAt: new Date(clock()).toISOString(), generatedAt: new Date(clock()).toISOString() };
  const complete = bankComplete(bank, { matchId, fingerprint, now: clock() });
  if (!complete) bank.bankStatus = 'partial';
  const failures = issues.map(row => row.code === 'access' ? `R2: acceso HTTP ${row.httpStatus}` : row.code === 'connection' ? 'R2: fallo de conexión' : row.code === 'validation' ? 'R2: recurso no compatible o inválido' : row.code === 'cache' ? 'Caché de media llena' : row.code === 'prompts' ? 'Prompts de media no disponibles o inválidos' : 'R2: dirección pública no configurada');
  const progress = { count: bank.assets.length, target: ASSETS_PER_MATCH, clips: videos.length, complete, ready: true,
    phase: issues.length ? 'unavailable' : 'finished', failures: [...new Set(failures)], diagnostics: issues,
    readerVersion: 1, legacyArtifacts, updatedAt: new Date(clock()).toISOString() };
  await atomic(join(dir, matchId + '.json'), bank);
  await atomic(join(dir, matchId + '.progress.json'), progress);
  await atomic(join(dir, matchId + '.ready'), { readerVersion: 1, updatedAt: progress.updatedAt });
  return progress;
}
