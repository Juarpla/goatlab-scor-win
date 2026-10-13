/** One ephemeral run budget; durable provider admission and verified R2 publication. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile, rm, rename, appendFile, readdir } from 'node:fs/promises';
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
import { reconcileVideoRecovery } from './reconcile-video-recovery.mjs';
import { safeMediaMessage, publicVideoDiagnostics, requestedMediaComplete, readyMediaLabels, mediaRunOutcome } from '../lib/media-diagnostics.js';

const execute = (file, args, options={}) => new Promise((resolve,reject) => {
  const { onStderr, ...settings } = options;
  const child=execFile(file,args,settings,(error,stdout,stderr)=> {
    if(error) { error.stdout=stdout; error.stderr=stderr; reject(error); } else resolve({stdout,stderr});
  });
  if(onStderr) child.stderr.on('data',onStderr);
});
const PIPELINE = fileURLToPath(new URL('./', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const digest = value => /^[a-f0-9]{64}$/.test(value ?? '');
const pngSize = bytes => Buffer.isBuffer(bytes) && bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : null;
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
  if (env.MEDIA_ROLE !== 'producer' || env.GITHUB_ACTIONS !== 'true') throw new Error('La generación de media pertenece exclusivamente a GitHub Actions');
  const started = clock(), runDeadline = mediaRunDeadline(started, env), runId = randomUUID();
  const repo = env.GOATLAB_REPO || '.', dir = args['--out'] || env.MEDIA_PACK_DIR || join(repo, 'public/data/media-pack');
  const results = [];
  const publishedByMatch = new Map();
  const runUrl = env.GITHUB_RUN_ID ? `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null;
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
  if(R2) await reconcileVideoRecovery({dir:join(dir,'gen'),env,transactImpl:(op,input)=>state(op,input),log});
  let r2ReadFailed=false;
  const r2 = async (cmd, ...values) => {
    if (!R2 && cmd !== 'record') return null;
    try {
      const { stdout } = await execImpl(process.execPath, [r2tool, cmd, ...values], { cwd: repo, env: { ...env, R2_NO_DOTENV: '1', R2_LEDGER: join(repo, 'public/data/r2-usage.json') }, maxBuffer: 8 * 1024 * 1024 });
      const result = JSON.parse(stdout);
      if (cmd !== 'record') addOperations(result.operations);
      return result;
    } catch(error) {
      if(cmd==='exists') r2ReadFailed=true;
      log('media: R2 ' + cmd + ': ' + safeMediaMessage(error.message,env));
      return null;
    }
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
  const recoveryMatches=[];
  if(R2 && env.AGNES_SKIP_VIDEO!=='1' && clock()<runDeadline) {
    const {tasks=[]}=await state('recoverable-videos',{});
    for(const matchId of new Set(tasks.map(task=>task.matchId))) {
      const match=(fixtures?.matches ?? []).find(m=>(m.webId ?? m.id)===matchId);
      const script=match ? null : await json(join(repo,'public/data/youtube-scripts',matchId+'.json'));
      const identity=match ?? (script && !scriptStructureErrors(script,{matchId}).length ? {...script,id:matchId,webId:matchId} : null);
      if(identity) recoveryMatches.push({...identity,recoveryOnly:true});
      else log('media: '+matchId+': tarea pendiente fuera de selección; falta identidad del partido para recuperar sin POST');
    }
  }
  const queue=[...recoveryMatches,...matches];
  for (const match of queue) {
    const recoveryOnly=match.recoveryOnly===true;
    if(recoveryOnly) log('media: '+(match.webId ?? match.id)+': recuperar tarea existente antes de generar; sin POST');
    const matchId = match.webId ?? match.id;
    if (!ID.test(matchId)) continue;
    if (/^(?:fd|af|bz)-[0-9]+$/.test(matchId)) {
      log('media: '+matchId+': identidad de equipos incompleta o ambigua; falta código descriptivo; sin publicación ni POST');
      results.push({matchId,images:0,clips:0,mode,failures:['Identidad de equipos incompleta o ambigua; falta código descriptivo'],diagnostics:[],resources:[],attempts:[]});continue;
    }
    const pack = async category => snapshot?.[category] ?? await json(join(repo, 'public/data', category, matchId + '.json'));
    const imagePack = await pack('image-prompts'), videoPack = await pack('video-prompts'), motionPack = await pack('motion-prompts');
    const validPack = (pack, category) => validateContent(pack, category, matchId) && !contentIdentityErrors(pack, match).length;
    const imagePrompts = validPack(imagePack, 'image-prompts') ? imagePack.prompts : [];
    const videoPrompts = validPack(videoPack, 'video-prompts') ? videoPack.prompts : [];
    const motionPrompts = validPack(motionPack, 'motion-prompts') ? motionPack.prompts : [];
    const script = await json(join(repo, 'public/data/youtube-scripts', matchId + '.json'));
    if (!recoveryOnly && !args['--match'] && (scriptStructureErrors(script, { matchId, match }).length || !imagePrompts.length || !videoPrompts.length)) { log('media: ' + matchId + ': sin guión o prompts válidos; omitido'); continue; }
    summary.eligible++;
    const folder = join(dir, 'gen', matchId); await mkdir(folder, { recursive: true });
    const prev = await json(join(dir, matchId + '.json'));
    const scorers = await json(join(repo, 'public/data/scorers.json'));
    const facts = motionPrompts.length ? motionPack.facts : editingFacts(match, scorers);
    const deadline = mediaSoftStop(runDeadline, match.kickoff), expiresAt = (Date.parse(match.kickoff) + 86_400_000) / 1000;
    const imageModel = env.AGNES_IMAGE_MODEL || 'agnes-image-2.5-flash', videoModel = 'agnes-video-2.5-flash';
    const fingerprint = contentFingerprint(match, { ...imagePack, generationModel: imageModel }, { ...videoPack, generationModel: videoModel });
    const failures = [];
    const deferrals = [];
    if(!publishedByMatch.has(matchId))publishedByMatch.set(matchId,new Set());
    const publishedFiles = publishedByMatch.get(matchId);
    let attempts = [];
    try { attempts = (await state('attempts',{matchId})).attempts ?? []; }
    catch(error) { failures.push('Historial de intentos no disponible: '+safeMediaMessage(error.message,env)); }
    let diagnostics = [];
    try { diagnostics=publicVideoDiagnostics(await json(join(folder,'video-diagnostics.json')),env); } catch {}
    if (!imagePrompts.length) failures.push('Image Prompts no disponibles');
    if (!videoPrompts.length) failures.push('Video Prompts no disponibles');
    if (!motionPrompts.length) failures.push('Motion Prompts no disponibles; montaje local disponible');
    if (!Number.isFinite(Date.parse(match.kickoff))) failures.push('Kickoff inválido; solo reutilización');
    if (!env.AGNES_API_KEY?.trim()) failures.push('falta AGNES_API_KEY');
    if (r2blocked) failures.push('R2: subidas y generación pausadas; reutilización disponible');
    let authorityReady = true;
    try { await state('heartbeat', { runId, matchId }); } catch(error) { authorityReady = false; failures.push('Estado de generación: heartbeat: ' + safeMediaMessage(error.message,env)); }
    const heartbeat = setInterval(() => { state('heartbeat', { runId, matchId }).catch(() => { authorityReady = false; }); }, 30_000); heartbeat.unref();
    const verifiedVideoOrdinals=new Set();
    let runPosts={};
    const assets = [], clips = [], verifiedAssets = new Set(), verifiedClips = new Set();
    const readyCounts = () => ({ images: verifiedAssets.size, clips: verifiedClips.size });
    const logReady = (stage, detail = '') => {
      const labels = readyMediaLabels(readyCounts());
      log(`media: ${matchId}: ${labels.images} · ${labels.clips} (${stage})${detail ? '; ' + detail : ''}`);
    };
    const publish = mediaPublisher({ dir, match, facts, prior: prev, draft: env.MEDIA_DRAFT === '1', clock: () => new Date(clock()).toISOString() });
    const extras = () => ({ clips:clips.sort((a,b)=>a.file.localeCompare(b.file)), motionPrompts, failures, diagnostics, runUrl, mode, contentVersion: 1, bankVersion: 2, contentFingerprint: fingerprint,
      storageVerifiedAt: new Date(clock()).toISOString(), verifiedAssets: [...verifiedAssets], verifiedClips: [...verifiedClips] });
    const cleanResource = async (file) => {
      const stem=file.replace(/\.[^.]+$/, '');
      try {
        const resource=new RegExp('^'+stem+'\\.(?:png|jpg|webp|mp4|json|response\\.json|accepted\\.json|prompt\\.txt|tmp)(?:\\.[0-9]+\\.tmp)?$');
        for(const name of (await readdir(folder)).filter(name=>resource.test(name)))
          await rm(join(folder,name),{force:true});
      } catch(error) { log('media: '+matchId+': limpieza temporal pendiente: '+safeMediaMessage(error.message,env)); }
    };
    const confirmStored = async (kind, ordinal, file, object, remote, sizeBytes, cleanupFile=file) => {
      const objectKey='partidos/'+matchId+'/'+file, meta=remote?.meta;
      if(!remote || remote.key!==objectKey || remote.bytes!==sizeBytes || !sizeBytes || !digest(object.sha256)
        || !meta || meta.sha256!==object.sha256 || meta.model!==object.model || meta.prompthash!==object.promptHash
        || Number(meta.width)!==object.width || Number(meta.height)!==object.height
        || (kind==='video' && (meta.referencehash!==object.referenceHash || Number(meta.duration)!==object.duration))) {
        failures.push('R2: objeto '+file+' sin verificación compatible después de la subida o consulta');
        return false;
      }
      try {
        const {slot}=await state('status',{matchId,kind,ordinal});
        if(!slot || slot.state!=='completed' || slot.model!==object.model || slot.promptHash!==object.promptHash
          || (kind==='video' && (slot.publicationReferenceHash??slot.referenceHash)!==object.referenceHash)) return false;
        if(kind==='video' && slot.publicationIndex && (Number(meta.attemptordinal)!==ordinal || Number(meta.publicationindex)!==slot.publicationIndex || meta.attemptid!==slot.attemptId))return false;
        if(slot.uploadClaim?.confirmed && slot.uploadClaim.sha256===object.sha256 && slot.uploadClaim.objectKey===objectKey && slot.uploadClaim.sizeBytes===sizeBytes) {
          if(cleanupFile)await cleanResource(cleanupFile);return true;
        }
        const claimId=slot.uploadClaim?.id || 'upload-'+object.sha256;
        const input={matchId,kind,ordinal,claimId,sha256:object.sha256,objectKey,sizeBytes,...(kind==='video'&&slot.publicationIndex?{publicationIndex:slot.publicationIndex}:{})};
        const claim=await state('uploadclaim',input);
        if(!claim.canPut) return false;
        const confirmation=await state('uploadconfirm',input);
        if(!confirmation.saved) return false;
        if(cleanupFile)await cleanResource(cleanupFile);
        return true;
      } catch(error) { failures.push('R2: confirmación '+file+': '+safeMediaMessage(error.message,env));return false; }
    };
    const putResource = async (kind, ordinal, saved, object) => {
      if (!R2 || r2blocked) return false;
      let attemptId;
      const pendingPublication=async reason=>{
        failures.push('R2: '+saved.file+': '+reason);
        if(attemptId)try { await state('diagnostic',{attemptId,record:{id:randomUUID(),at:clock(),runId,runUrl:runUrl??'',
          stage:'publication-pending',method:'NONE',httpStatus:null,providerCode:'',message:safeMediaMessage(reason,env).slice(0,256),providerStatus:'publication-pending',progress:null,requestId:''}}); }
        catch(error) {log('media: '+matchId+': diagnóstico de publicación no guardado: '+safeMediaMessage(error.message,env)+'; no repetir POST');}
        return false;
      };
      try {
        const bytes = await readFile(join(folder, saved.file)), sha256 = hash(bytes);
        const {slot}=await state('status', { matchId, kind, ordinal });
        attemptId=slot?.attemptId;
        if (!slot || slot.state !== 'completed' || slot.promptHash !== object.promptHash || slot.model !== object.model || (kind === 'video' && slot.referenceHash !== object.referenceHash)) return false;
        const publicationFile=saved.publicationFile??saved.file;
        const objectKey='partidos/'+matchId+'/'+publicationFile;
        const claimId = slot.uploadClaim?.id || 'upload-' + sha256;
        const claim = await state('uploadclaim', { matchId, kind, ordinal, claimId, sha256,objectKey,sizeBytes:bytes.length,...(kind==='video'?{publicationIndex:slot.publicationIndex}:{}) });
        if (!claim.canPut) return false;
        const mime = kind === 'video' ? 'video/mp4' : saved.file.endsWith('.png') ? 'image/png' : saved.file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        const values = ['model=' + object.model, 'prompthash=' + object.promptHash, 'sha256=' + sha256, 'width=' + object.width, 'height=' + object.height];
        if (kind === 'video') values.push('referencehash=' + object.referenceHash, 'duration=' + object.duration, 'attemptordinal='+ordinal, 'publicationindex='+slot.publicationIndex, 'attemptid='+slot.attemptId);
        if(kind==='video') {
          const occupied=(await r2('exists',objectKey))?.found;
          if(r2ReadFailed)return pendingPublication('HEAD previo fallido; destino sin verificar');
          if(occupied && (occupied.meta?.attemptid!==slot.attemptId || occupied.meta?.sha256!==sha256 || Number(occupied.meta?.publicationindex)!==slot.publicationIndex))return pendingPublication('destino ocupado por otro recurso; no se sobrescribe');
        }
        if (!(await r2('put', join(folder, saved.file), objectKey, mime, ...values))) return pendingPublication('PUT fallido; publicación pendiente');
        const {found}=(await r2('exists',objectKey)) ?? {};
        const confirmed=await confirmStored(kind,ordinal,publicationFile,object,found,bytes.length,null);
        if(confirmed) {
          publishedFiles.add(publicationFile);
          await cleanResource(saved.file);
          try { await state('diagnostic',{attemptId:slot.attemptId,record:{id:randomUUID(),at:clock(),runId,runUrl:runUrl??'',
            stage:'publication-confirmed',method:'NONE',httpStatus:null,providerCode:'',message:'publicación verificada en R2',providerStatus:'published',progress:null,requestId:''}}); }
          catch(error) { log('media: '+matchId+': diagnóstico de publicación no guardado: '+safeMediaMessage(error.message,env)+'; no repetir POST'); }
        }
        return confirmed || pendingPublication('HEAD o confirmación incompatibles; publicación pendiente');
      } catch(error) { return pendingPublication('publicación pendiente: '+safeMediaMessage(error.message,env)); }
    };
    try {
      const guardFile = join(folder, 'guard.json'), operationsFile = join(folder, 'operations-' + runId + '.jsonl');
      await writeFile(guardFile, JSON.stringify(match));
      const childEnv = { ...env, GOATLAB_REPO: repo, AGNES_STATE_DB: env.AGNES_STATE_DB || join(dir, 'agnes.sqlite'), AGNES_RUN_ID: runId, AGNES_RESOURCE_RETRIES: '3',
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
          if (!local && remote) {
            try {
              const slot = (await state('status', { matchId, kind: 'image', ordinal })).slot;
              if (slot?.state === 'completed' && slot.promptHash === hash(desired || '') && (slot.model || imageModel) === imageModel) local = { prompt: desired, model: imageModel };
            } catch {}
          }
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
          if ((!asset.width || !asset.height) && file.endsWith('.png') && bytes) {
            const size = pngSize(bytes);
            if (size) { asset.width = size.width; asset.height = size.height; }
          }
          if (assetErrors(asset).length) continue;
          if (remote ? await confirmStored('image',ordinal,file,asset,remote,bytes.length) : await putResource('image',ordinal,{file},asset)) {
            assets.push(asset); summary.reused++; verifiedAssets.add(asset.id);
          }
          break;
        }
      }
      for (let ordinal = 0; ordinal < 5 && clips.length < 2; ordinal++) {
        if(!R2||!authorityReady)continue;
        let videoSlot;try{videoSlot=(await state('status',{matchId,kind:'video',ordinal})).slot;}catch(error){r2ReadFailed=true;failures.push('R2: identidad privada no disponible; sin nuevas tareas');continue;}
        if(!videoSlot || videoSlot.state!=='completed')continue;
        const canonical=!!videoSlot.uploadClaim?.publicationIndex;
        const file = canonical?'clip-'+videoSlot.publicationIndex+'.mp4':'clip-'+ordinal+'.mp4', path = join(folder, file), desired = videoPrompts[ordinal % Math.max(1, videoPrompts.length)]?.prompt;
        const prior = prev?.clips?.find(c => c.file === file && c.source === 'agnes');
        const saved = await json(join(folder, 'clip-' + ordinal + '.json'));
        const local = saved && saved.prompt === desired && saved.model === videoModel ? saved : prior;
        const found = await r2('exists', 'partidos/' + matchId + '/' + file), remote = found?.found;
        const meta = remote && typeof remote === 'object' ? remote.meta ?? {} : {};
        if(canonical && remote && (Number(meta.attemptordinal)!==ordinal || Number(meta.publicationindex)!==videoSlot.publicationIndex || meta.attemptid!==videoSlot.attemptId)) {failures.push('R2: identidad de publicación incompatible: '+file);r2ReadFailed=true;continue;}
        if(!canonical && meta.publicationindex!==undefined && Number(meta.attemptordinal)!==ordinal)continue;
        if(!canonical && (remote||local)) {failures.push('R2: clip con nombre antiguo; requiere migración verificada: '+file);r2ReadFailed=true;continue;}
        const promptHash = meta.prompthash || local?.promptHash || (local?.prompt ? hash(local.prompt) : null);
        const referenceHash = meta.referencehash || local?.referenceHash || (local?.reference ? hash(local.reference) : null);
        if (!desired || promptHash !== hash(desired) || !digest(referenceHash) || !assets.some(a => hash(a.url) === referenceHash)) continue;
        let bytes; try { bytes = await readFile(path); } catch {}
        if (remote && (!bytes || !digest(meta.sha256) || hash(bytes) !== meta.sha256)) bytes = await download(R2.base + '/partidos/' + encodeURIComponent(matchId) + '/' + file, path, 32_000_000);
        if (!bytes || (digest(meta.sha256) && hash(bytes) !== meta.sha256)) continue;
        const clip = { id: matchId + '-clip-' + videoSlot.publicationIndex, source: 'agnes', file, url: base + '/' + encodeURIComponent(matchId) + '/' + file,
          width: Number(meta.width || local?.width), height: Number(meta.height || local?.height), duration: Number(meta.duration || local?.duration),
          model: meta.model || local?.model, promptHash, referenceHash, sha256: hash(bytes) };
        if (clip.model !== videoModel || clip.width !== 720 || clip.height !== 1280 || !Number.isFinite(clip.duration) || clip.duration < 4 || clip.duration > 12.5) continue;
        if (remote ? await confirmStored('video',ordinal,file,clip,remote,bytes.length) : await putResource('video',ordinal,{file},clip)) {
          clips.push(clip); summary.reused++; verifiedClips.add(clip.id);verifiedVideoOrdinals.add(ordinal);
        }
      }
      if(R2 && authorityReady)for(const index of [0,1,2,3,4]) {
        const file='clip-'+index+'.mp4';
        const remote=(await r2('exists','partidos/'+matchId+'/'+file))?.found;
        if(remote && !clips.some(clip=>clip.file===file)) {
          r2ReadFailed=true;failures.push('R2: clip existente sin identidad confirmada o con nombre antiguo: '+file+'; sin nuevas tareas');
        }
      }
      if(r2ReadFailed) failures.push('R2: no se pudo verificar inventario; no se crean clips hasta confirmar los existentes');
      logReady('inventario R2');
      await publish(assets, 'generating', extras());
      const canGenerate = () => {
        if(recoveryOnly) return false;
        const blockers = [];
        if (!fingerprint) blockers.push('Huella de contenido inválida; revisar identidad, versión y prompts');
        if (!authorityReady) blockers.push('Estado privado de generación no disponible; generación pausada');
        if (!env.AGNES_API_KEY?.trim()) blockers.push('falta AGNES_API_KEY');
        if (r2blocked) blockers.push('R2: subidas y generación pausadas; reutilización disponible');
        if (r2ReadFailed) blockers.push('R2: inventario sin verificar; generación pausada');
        if (deadline <= clock()) blockers.push('Generación: presupuesto de corrida agotado o plazo del partido vencido');
        if (!args['--match'] && (match.status !== 'NS' || Date.parse(match.kickoff) <= clock())) blockers.push('Partido fuera de la ventana de generación; solo reutilización');
        for (const reason of blockers) if (!failures.includes(reason)) failures.push(reason);
        return blockers.length === 0;
      };
      if (env.AGNES_SKIP_IMAGES !== '1' && verifiedAssets.size < 4 && canGenerate()) for (const [ordinal, row] of imagePrompts.entries()) {
        if (assets.some(a => a.id === matchId + '-' + ordinal)) continue;
        if (!canGenerate()) break;
        const timeout = Number(env.AGNES_TIMEOUT_SECONDS || 300);
        if (clock() + timeout * 1000 + 35_000 > deadline) { failures.push('Imágenes: presupuesto de corrida agotado'); for(let number=ordinal+1;number<=4;number++)deferrals.push({kind:'image',number,code:'run-deadline'}); break; }
        const promptFile = join(folder, ordinal + '.prompt.txt'); await writeFile(promptFile, row.prompt);
        try {
          const { stdout } = await execImpl(env.PYTHON_BIN || 'python3', [join(PIPELINE, 'agnes.py'), '--match=' + matchId, '--index=' + ordinal,
            '--expires-at=' + expiresAt, '--attempt-deadline=' + deadline / 1000, '--prompt-file=' + promptFile, '--out=' + folder],
          { env: childEnv, timeout: Math.max(1, deadline - clock()), maxBuffer: 1024 * 1024, onStderr:chunk=>log(safeMediaMessage(chunk,env)) });
          const saved = JSON.parse(stdout);
          if (saved.prompt !== row.prompt || saved.model !== imageModel || !/^[0-3]\.(jpg|png|webp)$/.test(saved.file)) throw new Error('Resultado incompatible');
          const bytes = await readFile(join(folder, saved.file));
          const asset = { ...normalizeAgnesImage({ matchId, index: ordinal, publicUrl: base + '/' + encodeURIComponent(matchId) + '/' + saved.file,
            model: saved.model, prompt: saved.prompt, at: saved.at }), model: saved.model, width: saved.width, height: saved.height, prepared: true, promptHash: hash(saved.prompt), sha256: hash(bytes) };
          if (assetErrors(asset).length) throw new Error('Imagen inválida');
          summary.generated++;
          if (await putResource('image', ordinal, saved, asset)) {
            assets.push(asset); verifiedAssets.add(asset.id);
            logReady('subida de imagen confirmada');
          } else failures.push('R2: subida de imagen sin confirmar');
          await publish(assets, 'generating', extras());
        } catch (error) { const reason = safeMediaMessage(error.stderr || error.message,env).trim(); failures.push('Imagen ' + (ordinal + 1) + ': ' + reason); if(/Solicitud aplazada por el control de ritmo|presupuesto de preparación agotado/.test(reason))deferrals.push({kind:'image',number:ordinal+1,code:'rate-wait'}); if (/429|incierto|pausado|cuota/.test(reason)) break; }
      }
      await publish(assets, 'generating-clips', extras());
      const canRetrieve=authorityReady && !r2blocked && !r2ReadFailed && !!env.AGNES_API_KEY?.trim() && deadline>clock();
      if (env.AGNES_SKIP_VIDEO !== '1' && verifiedClips.size < 2 && (recoveryOnly ? canRetrieve : canGenerate()) && videoPrompts.length && assets.length && clips.length < 2) {
        const input = join(folder, 'video-input.json'); await writeFile(input, JSON.stringify({ matchId, prompts: videoPrompts, images: assets, recoverOnly:recoveryOnly, deadline: (recoveryOnly ? Math.min(deadline,clock()+60_000) : deadline) / 1000, expiresAt, verifiedClips: [...verifiedVideoOrdinals].map(ordinal=>'clip-'+ordinal+'.mp4') }));
        try {
          const { stdout, stderr } = await execImpl(env.PYTHON_BIN || 'python3', [join(PIPELINE, 'agnes_video.py'), '--input=' + input, '--out=' + folder],
            { env: childEnv, timeout: Math.max(1, deadline - clock() + 500), maxBuffer: 1024 * 1024, onStderr: chunk=>log(safeMediaMessage(chunk,env)) });
          const result = JSON.parse(stdout); deferrals.push(...(result.deferrals??[])); runPosts=result.runPosts??runPosts; failures.push(...(result.failures ?? []).map(message=>safeMediaMessage(message,env)));
          diagnostics=publicVideoDiagnostics(result.diagnostics,env);
          if(stderr && execImpl !== execute) log(safeMediaMessage(stderr,env));
          for (const saved of result.clips ?? []) {
            if (verifiedVideoOrdinals.has(saved.index) || clips.length >= 2 || !/^clip-[0-4]\.mp4$/.test(saved.file)) continue;
            const bytes = await readFile(join(folder, saved.file));
            let publicationIndex=saved.index,publicationFile=saved.file;
            const clip = { id: matchId + '-clip-' + publicationIndex, source: 'agnes', file: publicationFile, url: base + '/' + encodeURIComponent(matchId) + '/' + publicationFile,
              width: saved.width, height: saved.height, duration: saved.duration, model: saved.model || videoModel, promptHash: saved.promptHash || hash(saved.prompt),
              referenceHash: saved.referenceHash || hash(saved.reference), sha256: hash(bytes) };
            const ordinal = Number(saved.file.match(/^clip-([0-4])\.mp4$/)[1]);
            if (saved.index !== ordinal || clip.model !== videoModel || clip.promptHash !== hash(videoPrompts[ordinal % videoPrompts.length].prompt)
              || !assets.some(asset => hash(asset.url) === clip.referenceHash) || clip.width !== 720 || clip.height !== 1280
              || !Number.isFinite(clip.duration) || clip.duration < 4 || clip.duration > 12.5) {
              failures.push('Clip recuperado de otra identidad; conservado sin publicar'); continue;
            }
            ({publicationIndex}=await state('publication-slot',{matchId,kind:'video',ordinal:saved.index}));
            publicationFile='clip-'+publicationIndex+'.mp4';
            Object.assign(clip,{id:matchId+'-clip-'+publicationIndex,file:publicationFile,url:base+'/'+encodeURIComponent(matchId)+'/'+publicationFile});
            summary.generated++;
            if (await putResource('video', saved.index, {...saved,publicationFile}, clip)) {
              clips.push(clip); verifiedClips.add(clip.id);verifiedVideoOrdinals.add(saved.index);
              logReady('subida de clip confirmada');
              await publish(assets, 'generating-clips', extras());
            } else failures.push('R2: subida de clip sin confirmar');
          }
        } catch (error) { failures.push('Clips: ' + safeMediaMessage(error.stderr || error.message,env)); }
      }
      const complete = requestedMediaComplete({ ...readyCounts(), mode });
      if (!complete) {
        canGenerate();
        if (!failures.some(reason => reason !== 'Motion Prompts no disponibles; montaje local disponible')) {
          failures.push('Recursos incompletos; no se obtuvieron todos los recursos solicitados con verificación R2');
        }
      }
      const result = await publish(assets, 'finished', extras());
      if (complete) { summary.completed++; if(result.complete) summary.completedIds.push(matchId); } else summary.pending++;
      try { for (const line of (await readFile(operationsFile, 'utf8')).split('\n').filter(Boolean)) addOperations(JSON.parse(line)); } catch {}
      await rm(operationsFile, { force: true });
      const priorResult=results.findIndex(row=>row.matchId===matchId);
      try { attempts = (await state('attempts',{matchId})).attempts ?? attempts; }
      catch(error) { failures.push('Historial final no disponible: '+safeMediaMessage(error.message,env)); }
      const omission=recoveryOnly?'recuperación de tareas existentes; sin nuevas solicitudes':failures
        .filter(reason=>reason!=='Motion Prompts no disponibles; montaje local disponible'&&!/^(?:clip|intento de vídeo) \d+: etapa=/.test(reason))
        .map(reason=>reason.split('; última consulta:')[0]).join('; ').slice(0,256) || 'todavía no solicitado';
      const resources=[];
      for(let ordinal=0;ordinal<4;ordinal++) {
        const asset=assets.find(asset=>asset.id===matchId+'-'+ordinal);
        const attempt=attempts.filter(row=>row.kind==='image'&&row.ordinal===ordinal).at(-1);
        const file=asset?.url.split('/').at(-1);
        resources.push({kind:'image',number:ordinal+1,status:asset?(publishedFiles.has(file)?'publicado en esta corrida':'reutilizado'):attempt?'ausente':'pendiente',
          objectKey:asset?'partidos/'+matchId+'/'+file:null,verified:!!asset,
          reason:asset?(publishedFiles.has(file)?'subida y verificación R2 confirmadas':'verificado en R2; sin petición a Agnes'):
            attempt?.state==='completed'?'resultado ausente en R2; pendiente de recuperación o nueva generación':mode==='clips-only'?'imágenes omitidas por modo clips-only':omission});
      }
      for(let index=0;index<2;index++) {
        const clip=clips.find(clip=>clip.file==='clip-'+(index+1)+'.mp4');
        resources.push({kind:'video',number:index+1,status:clip?(publishedFiles.has(clip.file)?'publicado en esta corrida':'reutilizado'):'pendiente',
          objectKey:clip?'partidos/'+matchId+'/'+clip.file:null,verified:!!clip,
          reason:clip?(publishedFiles.has(clip.file)?'subida y verificación R2 confirmadas':'verificado en R2; sin petición a Agnes'):mode==='images-only'?'clips omitidos por modo images-only':omission});
      }
      for(const resource of resources) {
        const active=attempts.find(attempt=>attempt.kind===resource.kind && (resource.kind==='image'?attempt.ordinal+1===resource.number:attempt.publicationIndex===resource.number) && attempt.hasVideoId && attempt.state==='pending');
        const publication=attempts.find(attempt=>attempt.kind===resource.kind && (resource.kind==='image'?attempt.ordinal+1===resource.number:attempt.publicationIndex===resource.number) && attempt.state==='completed' && attempt.uploadClaim);
        resource.state=resource.verified?'listo':active?'generando':publication?'publicando':'pendiente';
        const calls=attempts.filter(attempt=>attempt.kind===resource.kind && (resource.kind==='image'?attempt.ordinal+1===resource.number:attempt.publicationIndex===resource.number) && attempt.diagnostics?.events?.some(event=>event.runId===runId && event.method==='POST'));
        resource.postsThisRun=resource.kind==='video'?runPosts[String(resource.number)]??calls.length:calls.length;
        const own=attempts.filter(attempt=>attempt.kind===resource.kind && (resource.kind==='image'?attempt.ordinal+1===resource.number:attempt.publicationIndex===resource.number)).at(-1);
        const rejected=own?.diagnostics?.events?.findLast(event=>event.runId===runId && event.method==='POST' && event.httpStatus===503);
        if(!resource.verified && rejected)resource.reason='HTTP 503'+(rejected.providerCode?': '+rejected.providerCode:'')+'; sin más POST para este recurso en esta corrida; reintentar en otra corrida';
      }
      if(authorityReady)try{await state('resource-status',{matchId,resources});}catch(error){failures.push('Estado de recursos no guardado: '+safeMediaMessage(error.message,env));}
      for(const resource of resources)log('media-resource: '+matchId+': '+(resource.kind==='image'?'imagen ':'clip ')+resource.number+': '+resource.status+'; '+resource.reason+(resource.objectKey?'; '+resource.objectKey:''));
      for(const attempt of attempts)log('media-attempt: '+JSON.stringify({matchId,kind:attempt.kind,ordinal:attempt.ordinal,state:attempt.state,
        history:attempt.diagnostics?.events?.map(event=>({...event,origin:event.runId===runId?'corrida actual':'historial anterior'}))??'detalle original no conservado',queryCount:attempt.diagnostics?.queryCount??null}));
      const report={matchId,...readyCounts(),mode,failures,diagnostics,runUrl,resources,attempts,deferrals,recoveryOnly,retryPolicy:{maxPostsPerResource:3,scope:'run'}};
      if(priorResult<0) results.push(report); else results[priorResult]=report;
      logReady('final', failures.join('; '));
    } finally { clearInterval(heartbeat); try { await state('heartbeat', { runId, finished: true }); } catch {} }
  }
  summary.eligible=results.length;
  summary.completed=results.filter(row=>requestedMediaComplete(row)).length;
  summary.pending=summary.eligible-summary.completed;
  summary.completedIds=[...new Set(summary.completedIds)];
  try { await state('run-summary', Object.fromEntries(['runId', 'eligible', 'pending', 'generated', 'reused', 'completed'].map(key => [key, summary[key]]))); } catch {}
  if (R2) await r2('record', String(operations.media.opsA), String(operations.media.opsB), String(operations.control.opsA), String(operations.control.opsB));
  const publication = { allow_commit: summary.completedIds.length > 0 || summary.deletedIds.length > 0,
    complete_ids: summary.completedIds, deleted_ids: summary.deletedIds, generated: summary.generated };
  await mkdir(join(repo, '.cache'), { recursive: true });
  const publicationPath = join(repo, '.cache/media-publication.json'), temporary = publicationPath + '.' + runId + '.tmp';
  await writeFile(temporary, JSON.stringify(publication));
  await rename(temporary, publicationPath);
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, 'allow_commit=' + publication.allow_commit + '\ncomplete_ids=' + JSON.stringify(publication.complete_ids) + '\ndeleted_ids=' + JSON.stringify(publication.deleted_ids) + '\n');
  const report={ ...summary, operations, results, mode: env.AGNES_SKIP_VIDEO === '1' ? 'images-only' : env.AGNES_SKIP_IMAGES === '1' ? 'clips-only' : 'all', runUrl };
  report.outcome=mediaRunOutcome(report);
  await writeFile(join(repo,'.cache/media-run.json'), JSON.stringify(report,null,2));
  return report;
}

export async function runMediaCli() {
  try { const result = await generateMediaBanks({ args: parseMediaArgs(process.argv.slice(2)) }); console.log(JSON.stringify(result)); if(result.outcome.status==='deferred')console.log('media: finalizado con recursos pendientes por condiciones temporales; código 0; consultar summary'); if(result.outcome.exitCode) { console.error('media: faltan recursos solicitados o fallo de ejecución; revisar diagnóstico por partido'); process.exitCode=result.outcome.exitCode; } }
  catch (error) { console.error('media: ' + safeMediaMessage(error.message,process.env)); process.exitCode = 2; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await runMediaCli();
