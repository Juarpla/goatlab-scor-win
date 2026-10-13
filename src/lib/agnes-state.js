import { randomUUID, createHash } from 'node:crypto';
import { safeMediaMessage } from './media-diagnostics.js';

export const AGNES_STATE_MAX_BYTES = 900_000;
const dayAt = now => new Date(now).toISOString().slice(0, 10);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value);
const uuid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key=>allowed.includes(key));
const isoUtc = value => typeof value==='string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
const diagnosticFields=['id','at','runId','runUrl','stage','method','httpStatus','providerCode','message','providerStatus','progress','requestId','next'];
function validateDiagnostics(value) {
  if(!keys(value,['events','queryCount']) || !Number.isSafeInteger(value.queryCount) || value.queryCount<0 || !Array.isArray(value.events) || value.events.length>8) throw new Error('diagnósticos Agnes corruptos');
  for(const row of value.events) if(!keys(row,diagnosticFields) || !uuid(row.id) || !finite(row.at) || !uuid(row.runId)
    || !['GET','POST','PUT','HEAD','NONE'].includes(row.method) || (row.httpStatus!==null && (!Number.isInteger(row.httpStatus) || row.httpStatus<100 || row.httpStatus>599))
    || (row.progress!==null && (!finite(row.progress)||row.progress>100))
    || !['stage','providerCode','message','providerStatus','requestId','runUrl','next'].every(key=>typeof row[key]==='string' && row[key].length<=(key==='runUrl'?512:key==='message'?256:128))) throw new Error('diagnóstico Agnes inválido');
}
function recordDiagnostic(attempt, input) {
  const record=Object.fromEntries(diagnosticFields.map(key=>[key,input[key]??(['httpStatus','progress'].includes(key)?null:'')]));
  for(const key of ['stage','providerCode','message','providerStatus','requestId','next']) record[key]=safeMediaMessage(record[key]).slice(0,key==='message'?256:128);
  record.runUrl=/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/.test(record.runUrl)?record.runUrl:'';
  validateDiagnostics({events:[record],queryCount:0});
  const diagnostics=attempt.diagnostics??={events:[],queryCount:0};
  if(diagnostics.events.some(event=>event.id===record.id)) return false;
  if(record.method==='GET' && record.stage.startsWith('retrieve'))diagnostics.queryCount++;
  const previous=diagnostics.events.at(-1);
  if(previous?.method==='GET' && record.method==='GET' && previous.stage===record.stage && previous.httpStatus===record.httpStatus && previous.providerStatus===record.providerStatus && previous.providerCode===record.providerCode) diagnostics.events.pop();
  diagnostics.events.push(record);
  while(diagnostics.events.length>8) {
    const disposable=diagnostics.events.findIndex((event,index)=>index>0 && event.method==='GET');
    diagnostics.events.splice(disposable>=0?disposable:1,1);
  }
  return true;
}
export const slotKey = ({matchId, kind, ordinal}) => `${matchId}:${kind}:${ordinal}`;

export function validateAgnesState(state) {
  if (!object(state) || ![1,2].includes(state.version) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(state.revision) || !isoUtc(state.updatedAt) || !object(state.limits) || !object(state.cutover) || !Array.isArray(state.cutover.legacyMatchIds)) throw new Error('autoridad Agnes inválida');
  if (!keys(state,['version','revision','updatedAt','cutover','limits','quota','rates','matches','slots','attempts','runs','summaries','usage','activeVideoAttemptId','failureEvents','maintenance','resources']) || !keys(state.cutover,['atMs','legacyMatchIds']) || !keys(state.limits,['images','video_seconds','imageRpm','videoStartIntervalMs']) || !keys(state.rates,['imageStarts','imageThrottleUntil','videoNextAt']) || !keys(state.usage,['opsA','opsB'])) throw new Error('campos privados Agnes no admitidos');
  if(state.maintenance!==undefined && state.maintenance!==null && (!keys(state.maintenance,['owner','untilMs']) || !uuid(state.maintenance.owner) || !finite(state.maintenance.untilMs))) throw new Error('exclusión de mantenimiento Agnes inválida');
  if(state.resources!==undefined) {
    if(!object(state.resources))throw new Error('recursos Agnes inválidos');
    for(const [key,row] of Object.entries(state.resources))if(!keys(row,['matchId','kind','number','state','reason','objectKey','verifiedAt']) || key!==`${row.matchId}:${row.kind}:${row.number}` || !id(row.matchId) || !['image','video'].includes(row.kind) || !Number.isInteger(row.number) || row.number<1 || row.number>(row.kind==='image'?4:2) || !['pendiente','generando','publicando','listo'].includes(row.state) || typeof row.reason!=='string' || row.reason.length>256 || (row.objectKey!==null && (typeof row.objectKey!=='string' || !row.objectKey.startsWith(`partidos/${row.matchId}/`))) || (row.verifiedAt!==null&&!isoUtc(row.verifiedAt)) || row.state==='listo'&&(!row.objectKey||!row.verifiedAt))throw new Error('estado de recurso Agnes inválido');
  }
  const positions=new Set();
  for (const row of Object.values(state.slots)) if(row.publicationIndex!==undefined) {
    const key=row.matchId+':'+row.publicationIndex;
    if(row.kind!=='video'||![1,2].includes(row.publicationIndex)||positions.has(key))throw new Error('posición de publicación Agnes inválida');
    positions.add(key);
  }
  for (const name of ['quota','rates','matches','slots','attempts','runs','summaries','usage']) if (!object(state[name])) throw new Error('autoridad Agnes inválida');
  for (const name of ['images','video_seconds','imageRpm','videoStartIntervalMs']) if (!finite(state.limits[name]) || state.limits[name] <= 0) throw new Error('límites Agnes inválidos');
  if (!Number.isSafeInteger(state.limits.images) || !Number.isInteger(state.limits.imageRpm) || state.limits.imageRpm>80 || state.limits.videoStartIntervalMs<12_000) throw new Error('límites Agnes inválidos');
  if (!Array.isArray(state.rates.imageStarts) || !state.rates.imageStarts.every(finite) || !finite(state.rates.imageThrottleUntil) || !finite(state.rates.videoNextAt) || !Array.isArray(state.failureEvents)) throw new Error('ritmo Agnes inválido');
  for (const [day, value] of Object.entries(state.quota)) if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isoUtc(`${day}T00:00:00.000Z`) || !object(value) || !Number.isSafeInteger(value.images) || value.images < 0 || !finite(value.video_seconds) || Object.keys(value).some(k=>!['images','video_seconds'].includes(k))) throw new Error('cuota Agnes inválida');
  if (!finite(state.cutover.atMs) || !state.cutover.legacyMatchIds.every(id) || !finite(state.usage.opsA) || !finite(state.usage.opsB)) throw new Error('migración Agnes inválida');
  if (!state.quota[dayAt(state.cutover.atMs)]) throw new Error('cuota del corte ausente');
  for (const [key,row] of Object.entries(state.slots)) {
    if (!object(row)) throw new Error('slot Agnes corrupto');
    if (row.state==='retired') {
      if (!keys(row,['matchId','kind','ordinal','attemptId','state','expiresAtMs','generationMatchId','publicationIndex']) || key!==slotKey(row) || !id(row.matchId) || !['image','video'].includes(row.kind) || !Number.isInteger(row.ordinal) || row.ordinal<0 || row.ordinal>=(row.kind==='image'?4:5) || !finite(row.expiresAtMs) || !uuid(row.attemptId) || state.attempts[row.attemptId]?.slotKey!==key || state.attempts[row.attemptId]?.state!=='retired') throw new Error('tombstone Agnes corrupto');
      continue;
    }
    validateSlotInput(row);
    if (!keys(row,['matchId','kind','ordinal','promptHash','model','referenceHash','attemptId','state','videoId','expiresAtMs','reservedDay','reservedUnits','refunded','pollNextAtMs','pollLease','uploadClaim','publicationIndex','generationMatchId','publicationReferenceHash'])) throw new Error('campos de slot Agnes no admitidos');
    if((row.generationMatchId!==undefined&&!id(row.generationMatchId)) || (row.publicationReferenceHash!==undefined&&!digest(row.publicationReferenceHash)))throw new Error('identidad de publicación inválida');
    const attempt=state.attempts[row.attemptId];
    if (key!==slotKey(row) || !uuid(row.attemptId) || !['uncertain','pending','completed','failed','rejected','abandoned'].includes(row.state) || !finite(row.expiresAtMs) || !finite(row.reservedUnits) || !/^\d{4}-\d{2}-\d{2}$/.test(row.reservedDay) || !state.quota[row.reservedDay] || typeof row.refunded!=='boolean' || !finite(row.pollNextAtMs) || (row.videoId!==null && !id(row.videoId)) || (row.state==='pending' && !row.videoId) || (row.state==='rejected' && (!row.refunded || row.videoId)) || !object(attempt) || attempt.slotKey!==key || !Array.isArray(attempt.eventIds) || attempt.state!==row.state || attempt.refunded!==row.refunded) throw new Error('slot Agnes corrupto');
    if (row.pollLease!==null && (!keys(row.pollLease,['owner','untilMs']) || !uuid(row.pollLease.owner) || !finite(row.pollLease.untilMs))) throw new Error('lease Agnes corrupto');
    if (row.uploadClaim!==null && (!keys(row.uploadClaim,['id','sha256','confirmed','objectKey','sizeBytes','publicationIndex','previousObjectKey']) || !uuid(row.uploadClaim.id) || !digest(row.uploadClaim.sha256) || typeof row.uploadClaim.confirmed!=='boolean'
      || (row.uploadClaim.previousObjectKey!==undefined && !/^partidos\/[A-Za-z0-9_-]+\/(?:[0-3]\.(?:png|jpg|webp)|clip-[0-4]\.mp4)$/.test(row.uploadClaim.previousObjectKey))
      || ((row.uploadClaim.objectKey!==undefined || row.uploadClaim.sizeBytes!==undefined) && !validPublication(row,row.uploadClaim)))) throw new Error('subida Agnes corrupta');
  }
  for(const [attemptId,row] of Object.entries(state.attempts)) {
    if(!uuid(attemptId) || !keys(row,['slotKey','state','refunded','eventIds','diagnostics','identity']) || (!state.slots[row.slotKey] && !row.identity) || !['uncertain','pending','completed','failed','rejected','abandoned','retired'].includes(row.state) || typeof row.refunded!=='boolean' || !Array.isArray(row.eventIds) || !row.eventIds.every(uuid)) throw new Error('intento Agnes corrupto');
    if(row.identity) {validateSlotInput(row.identity);if(slotKey(row.identity)!==row.slotKey)throw new Error('identidad histórica Agnes inválida');}
    if(row.diagnostics!==undefined)validateDiagnostics(row.diagnostics);
  }
  if (state.activeVideoAttemptId!==null && (!state.attempts[state.activeVideoAttemptId] || !Object.values(state.slots).some(s=>s.attemptId===state.activeVideoAttemptId && s.kind==='video' && ['pending','uncertain'].includes(s.state)))) throw new Error('single-flight Agnes corrupto');
  for (const [matchId,row] of Object.entries(state.matches)) if (!id(matchId) || !keys(row,['closed','fenceRevision','expiresAtMs','cleanupConfirmed','redirectTo']) || typeof row.closed!=='boolean' || (row.redirectTo!==undefined&&(!id(row.redirectTo)||!row.closed||!state.matches[row.redirectTo])) || !finite(row.expiresAtMs) || (row.closed && !uuid(row.fenceRevision))) throw new Error('partido Agnes corrupto');
  for(const [runId,row] of Object.entries(state.runs)) if(!uuid(runId) || !keys(row,['matchId','untilMs']) || !finite(row.untilMs) || (row.matchId!==null && !id(row.matchId))) throw new Error('corrida Agnes corrupta');
  for(const [runId,row] of Object.entries(state.summaries)) if(!uuid(runId) || !keys(row,['runId','at','eligible','pending','generated','reused','completed']) || row.runId!==runId || !finite(row.at) || ['eligible','pending','generated','reused','completed'].some(k=>!Number.isSafeInteger(row[k]) || row[k]<0)) throw new Error('resumen Agnes corrupto');
  for(const event of state.failureEvents) if(!keys(event,['eventId','at','hourUTC','stage','httpStatus','matchId']) || !digest(event.eventId) || !finite(event.at) || !Number.isInteger(event.hourUTC) || event.hourUTC<0 || event.hourUTC>23 || !['create','retrieve'].includes(event.stage) || !id(event.matchId) || (event.httpStatus!==null && (!Number.isInteger(event.httpStatus) || event.httpStatus<100 || event.httpStatus>599))) throw new Error('evento Agnes corrupto');
  if (Buffer.byteLength(JSON.stringify(state)) > AGNES_STATE_MAX_BYTES) throw new Error('autoridad Agnes supera presupuesto');
  return state;
}

export function createAgnesState({nowMs, legacyMatchIds = [], legacySlots = [], caps = {images:4000, video_seconds:360}}) {
  if (!finite(nowMs) || !legacyMatchIds.every(id) || !finite(caps.images) || !finite(caps.video_seconds)) throw new Error('bootstrap Agnes inválido');
  const state = {version:1, revision:randomUUID(), updatedAt:new Date(nowMs).toISOString(), cutover:{atMs:nowMs,legacyMatchIds:[...new Set(legacyMatchIds)]}, limits:{images:caps.images,video_seconds:caps.video_seconds,imageRpm:12,videoStartIntervalMs:30_100}, quota:{[dayAt(nowMs)]:{images:caps.images,video_seconds:caps.video_seconds}}, rates:{imageStarts:[],imageThrottleUntil:0,videoNextAt:0}, matches:{}, slots:{}, attempts:{}, runs:{}, summaries:{},usage:{opsA:0,opsB:0},activeVideoAttemptId:null, failureEvents:[]};
  for (const row of legacySlots) {
    validateSlotInput(row);
    if (!['pending','uncertain','completed'].includes(row.state)) throw new Error('estado legacy inválido');
    const key = slotKey(row), attemptId = `legacy-${randomUUID()}`;
    const importedState = row.videoId && row.state==='uncertain'?'pending':row.state==='pending' && !row.videoId?'uncertain':row.state;
    state.slots[key] = {...pickIdentity(row), attemptId, state:importedState, videoId:row.videoId ?? null, expiresAtMs:row.expiresAtMs, reservedDay:dayAt(nowMs), reservedUnits:0, refunded:false, pollNextAtMs:0, pollLease:null, uploadClaim:null};
    state.attempts[attemptId] = {slotKey:key, state:state.slots[key].state, refunded:false, eventIds:[]};
    if (row.kind === 'video' && ['pending','uncertain'].includes(row.state)) state.activeVideoAttemptId ??= attemptId;
  }
  return validateAgnesState(state);
}

/** Retain every consumed slot/attempt identity, shedding old recovery metadata. */
export function compactAgnesState(state, {nowMs}) {
  let changed=false;
  for (const [key,row] of Object.entries(state.slots)) {
    if (row.state==='retired' || row.expiresAtMs>nowMs-7*86_400_000 || (row.uploadClaim && !row.uploadClaim.confirmed)) continue;
    state.slots[key]={matchId:row.matchId,kind:row.kind,ordinal:row.ordinal,attemptId:row.attemptId,state:'retired',expiresAtMs:row.expiresAtMs,...(row.generationMatchId?{generationMatchId:row.generationMatchId}:{}),...(row.publicationIndex?{publicationIndex:row.publicationIndex}:{})};
    for (const [attemptId,attempt] of Object.entries(state.attempts)) if (attempt.slotKey===key) state.attempts[attemptId]={slotKey:key,state:'retired',refunded:attempt.refunded,eventIds:[]};
    if (state.activeVideoAttemptId===row.attemptId) state.activeVideoAttemptId=null;
    changed=true;
  }
  for(const [attemptId,attempt] of Object.entries(state.attempts))if(attempt.identity?.expiresAtMs<nowMs-7*86_400_000 && state.slots[attempt.slotKey]?.attemptId!==attemptId){delete state.attempts[attemptId];changed=true;}
  for(const [key,resource] of Object.entries(state.resources??{}))if(state.matches[resource.matchId]?.closed && state.matches[resource.matchId].expiresAtMs<nowMs-7*86_400_000){delete state.resources[key];changed=true;}
  return changed;
}

function validateSlotInput(input) {
  if (!id(input.matchId) || !['image','video'].includes(input.kind) || !Number.isInteger(input.ordinal) || input.ordinal < 0 || input.ordinal >= (input.kind === 'image' ? 4 : 5) || !digest(input.promptHash) || input.model!==`agnes-${input.kind}-2.5-flash` || (input.referenceHash !== undefined && !digest(input.referenceHash))) throw new Error('identidad de slot inválida');
}
function pickIdentity(input) { return {matchId:input.matchId,kind:input.kind,ordinal:input.ordinal,promptHash:input.promptHash,model:input.model, ...(input.referenceHash ? {referenceHash:input.referenceHash} : {})}; }
function sameIdentity(row,input) { return ['promptHash','model','referenceHash'].every(key => row[key] === input[key]); }
function validPublication(row, value) {
  const canonical=value.publicationIndex!==undefined;
  if(canonical && (row.kind!=='video'||![1,2].includes(value.publicationIndex)||value.publicationIndex!==row.publicationIndex))return false;
  const file = row.kind==='image' ? `${row.ordinal}\\.(?:png|jpg|webp)` : `clip-${canonical?value.publicationIndex:row.ordinal}\\.mp4`;
  return typeof value.objectKey==='string' && [row.matchId,row.generationMatchId].filter(Boolean).some(matchId=>new RegExp(`^partidos/${matchId}/${file}$`).test(value.objectKey))
    && Number.isSafeInteger(value.sizeBytes) && value.sizeBytes>0 && value.sizeBytes<=(row.kind==='image'?64_000_000:32_000_000);
}
function resultFor(row, reason) { return {canPost:false,reason,...(row ? {state:row.state,attemptId:row.attemptId,videoId:row.videoId ?? null} : {})}; }

/** Pure transition. All production callers commit changed state through conditional R2 PUT. */
export function reduceAgnesState(original, operation, input = {}, {nowMs} = {}) {
  validateAgnesState(original);
  if (!finite(nowMs)) throw new Error('reloj de autoridad inválido');
  const state = structuredClone(original);
  let changed = false, result;
  const change = value => { changed = true; return value; };
  const matchState = matchId => state.matches[matchId] ??= {closed:false,fenceRevision:null,expiresAtMs:0};
  const readSlot = () => {
    if (!id(input.matchId) || !['image','video'].includes(input.kind) || !Number.isInteger(input.ordinal)) throw new Error('slot inválido');
    return state.slots[slotKey(input)];
  };
  const maintenanceActive=state.maintenance?.untilMs>nowMs;
  const requireMaintenance=()=>{if(!maintenanceActive||state.maintenance.owner!==input.owner)throw new Error('migración sin exclusión vigente');};
  if(maintenanceActive && ['reserve','renew-resource','resource-status','pollclaim','uploadclaim','uploadconfirm','cleanupclaim','cleanupconfirm','heartbeat'].includes(operation) && !input.finished) throw new Error('mantenimiento de nombres en curso; sin peticiones a Agnes');
  if(operation==='maintenance-lock') {
    if(!uuid(input.owner))throw new Error('propietario de migración inválido');
    if(maintenanceActive && state.maintenance.owner!==input.owner || Object.values(state.runs).some(run=>run.untilMs>nowMs))throw new Error('generación o migración en curso');
    state.maintenance={owner:input.owner,untilMs:nowMs+30*60_000};result=change({locked:true});
  } else if(operation==='maintenance-unlock') {
    requireMaintenance();state.maintenance=null;result=change({released:true});
  } else if(operation==='migrate-match') {
    requireMaintenance();
    if(!id(input.from)||!id(input.to)||input.from===input.to)throw new Error('migración de partido inválida');
    if(state.matches[input.from]?.redirectTo===input.to)result={saved:true};
    else {
      if(state.matches[input.to]||Object.values(state.slots).some(row=>row.matchId===input.to))throw new Error('partido destino existente');
      state.matches[input.to]=state.matches[input.from]??{closed:false,fenceRevision:null,expiresAtMs:0};
      state.matches[input.from]={closed:true,fenceRevision:input.owner,expiresAtMs:state.matches[input.to].expiresAtMs,redirectTo:input.to};
      for(const [key,row] of Object.entries(state.slots))if(row.matchId===input.from) {
        row.generationMatchId??=input.from;row.matchId=input.to;
        const target=slotKey(row);state.slots[target]=row;delete state.slots[key];
        for(const attempt of Object.values(state.attempts))if(attempt.slotKey===key)attempt.slotKey=target;
      }
      for(const [key,row] of Object.entries(state.resources??{}))if(row.matchId===input.from){row.matchId=input.to;if(row.objectKey)row.objectKey=row.objectKey.replace(`partidos/${input.from}/`,`partidos/${input.to}/`);state.resources[`${row.matchId}:${row.kind}:${row.number}`]=row;delete state.resources[key];}
      state.cutover.legacyMatchIds=state.cutover.legacyMatchIds.map(value=>value===input.from?input.to:value);
      for(const event of state.failureEvents)if(event.matchId===input.from)event.matchId=input.to;
      result=change({saved:true});
    }
  } else if(operation==='publication-slot') {
    if(maintenanceActive && state.maintenance.owner!==input.owner)throw new Error('migración en curso');
    const row=readSlot();
    if(!row||row.kind!=='video'||row.state!=='completed')throw new Error('posición sin generación completada');
    if(row.publicationIndex)result={publicationIndex:row.publicationIndex};
    else {
      const used=new Set(Object.values(state.slots).filter(slot=>slot.matchId===row.matchId).map(slot=>slot.publicationIndex));
      const index=[1,2].find(index=>!used.has(index));
      if(!index)throw new Error('dos posiciones de clips ya asignadas');
      row.publicationIndex=index;result=change({publicationIndex:index});
    }
  } else if(operation==='relocate-publication') {
    requireMaintenance();const row=readSlot();
    if(!row||row.state!=='completed'||!validPublication(row,input)||!digest(input.sha256))throw new Error('publicación migrada inválida');
    if(row.uploadClaim && row.uploadClaim.sha256!==input.sha256)throw new Error('hash de publicación migrada distinto');
    if(input.referenceHash!==undefined) {if(!digest(input.referenceHash))throw new Error('referencia migrada inválida');row.publicationReferenceHash=input.referenceHash;}
    const previousObjectKey=row.uploadClaim?.previousObjectKey??row.uploadClaim?.objectKey??input.sourceKey;
    row.uploadClaim={...(previousObjectKey&&previousObjectKey!==input.objectKey?{previousObjectKey}:{}),id:row.uploadClaim?.id??'upload-'+input.sha256,sha256:input.sha256,confirmed:true,objectKey:input.objectKey,sizeBytes:input.sizeBytes,...(input.publicationIndex?{publicationIndex:input.publicationIndex}:{})};
    result=change({saved:true});
  } else if(operation==='cleanup-publication') {
    requireMaintenance();const row=readSlot();
    if(!row?.uploadClaim?.confirmed || row.uploadClaim.objectKey!==input.objectKey)throw new Error('publicación sin confirmar');
    delete row.uploadClaim.previousObjectKey;result=change({saved:true});
  } else if (operation === 'resource-status') {
    if(!id(input.matchId) || state.matches[input.matchId]?.closed || !Array.isArray(input.resources) || input.resources.length!==6)throw new Error('reconciliación de recursos inválida');
    state.resources??={};
    for(const row of input.resources) {
      const key=`${input.matchId}:${row.kind}:${row.number}`;
      state.resources[key]={matchId:input.matchId,kind:row.kind,number:row.number,state:row.state,reason:safeMediaMessage(row.reason).slice(0,256),objectKey:row.objectKey??null,verifiedAt:row.state==='listo'?new Date(nowMs).toISOString():null};
    }
    state.version=2;result=change({saved:true});
  } else if (operation === 'renew-resource') {
    const row=readSlot();
    if(!row || row.attemptId!==input.attemptId || input.verifiedAbsent!==true || state.matches[input.matchId]?.closed
      || Object.entries(state.runs).some(([owner,run])=>run.matchId===input.matchId && run.untilMs>nowMs && input.owner!==owner)
      || (row.videoId && ['pending','uncertain'].includes(row.state))) throw new Error('recurso no renovable; recuperar tarea o verificar ausencia R2');
    state.attempts[row.attemptId].identity={...pickIdentity(row),expiresAtMs:row.expiresAtMs,...(row.publicationIndex?{publicationIndex:row.publicationIndex}:{}),...(row.videoId?{videoId:row.videoId}:{}),...(row.uploadClaim?{uploadClaim:row.uploadClaim}:{})};
    if(state.activeVideoAttemptId===row.attemptId)state.activeVideoAttemptId=null;
    delete state.slots[slotKey(row)];state.version=2;
    result=change({saved:true});
  } else if (operation === 'health') result = {ready:true,version:state.version};
  else if (operation === 'compact') {changed=compactAgnesState(state,{nowMs});result={saved:true,compacted:changed};}
  else if (operation === 'release-legacy') {
    if (input.confirm !== 'release-legacy') throw new Error('liberación legacy sin confirmar');
    const released=[];
    for (const [key,row] of Object.entries(state.slots)) {
      if ((row.state !== 'uncertain' && row.state !== 'pending') || (row.reservedUnits ?? 0) !== 0) continue;
      delete state.slots[key]; released.push(key);
      for (const [attemptId,attempt] of Object.entries(state.attempts)) {
        if (attempt.slotKey !== key) continue;
        delete state.attempts[attemptId];
        if (state.activeVideoAttemptId === attemptId) state.activeVideoAttemptId = null;
      }
    }
    state.cutover.legacyMatchIds=[];
    result=change({released,legacyCleared:true});
  }
  else if (operation === 'set-quota') {
    if (input.confirm !== 'set-quota') throw new Error('cuota sin confirmar');
    if (typeof input.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw new Error('día de cuota inválido');
    if (!Number.isInteger(input.images) || input.images < 0 || input.images > state.limits.images) throw new Error('cuota de imágenes inválida');
    if (typeof input.video_seconds !== 'number' || !(input.video_seconds >= 0) || input.video_seconds > state.limits.video_seconds) throw new Error('cuota de vídeo inválida');
    state.quota[input.day]={images:input.images,video_seconds:input.video_seconds};
    result=change({day:input.day,quota:state.quota[input.day]});
  }
  else if (operation === 'recover-uncertain') {
    const abandoned=[];
    for (const row of Object.values(state.slots)) {
      if (row.kind !== 'video' || row.state !== 'uncertain' || row.videoId) continue;
      if (Object.values(state.runs).some(run => run.matchId === row.matchId && run.untilMs > nowMs)) continue;
      row.state='abandoned'; state.attempts[row.attemptId].state='abandoned';
      if (state.activeVideoAttemptId === row.attemptId) state.activeVideoAttemptId=null;
      abandoned.push({matchId:row.matchId,ordinal:row.ordinal,reason:'sin identificador recuperable; reserva conservada'});
    }
    result=abandoned.length ? change({abandoned}) : {abandoned};
  }
  else if (operation === 'report') result = {quota:state.quota,failureEvents:state.failureEvents.filter(e => e.at >= nowMs-48*3_600_000).map(e=>({eventId:e.eventId,at:new Date(e.at).toISOString(),hourUTC:e.hourUTC,stage:e.stage,httpStatus:e.httpStatus,matchId:e.matchId})),runs:Object.values(state.summaries).filter(r=>r.at>=nowMs-48*3_600_000).map(r=>({runId:r.runId,at:new Date(r.at).toISOString(),eligible:r.eligible,pending:r.pending,generated:r.generated,reused:r.reused,completed:r.completed})),usage:{opsA:state.usage.opsA,opsB:state.usage.opsB},updatedAt:state.updatedAt};
  else if (operation === 'status') result = {slot:readSlot() ?? null,closed:state.matches[input.matchId]?.closed ?? false};
  else if (operation === 'attempts') {
    if(!id(input.matchId))throw new Error('partido inválido');
    result={attempts:Object.entries(state.attempts).filter(([,attempt])=>(attempt.identity??state.slots[attempt.slotKey])?.matchId===input.matchId).map(([attemptId,attempt])=>{
      const row=attempt.identity??state.slots[attempt.slotKey];
      return {attemptId,kind:row.kind,ordinal:row.ordinal,state:attempt.state,publicationIndex:row.publicationIndex??null,diagnostics:attempt.diagnostics??null,
        ...(row.attemptId===attemptId?{uploadClaim:row.uploadClaim??null,hasVideoId:!!row.videoId,publicationIndex:row.publicationIndex??null}:{})};
    })};
  } else if (operation === 'diagnostic') {
    const attempt=state.attempts[input.attemptId];
    if(!attempt || attempt.state==='retired')throw new Error('diagnóstico sin intento vigente');
    const saved=recordDiagnostic(attempt,input.record??{});
    result=saved?change({saved:true}):{saved:true};
  }
  else if (operation === 'recoverable-videos') result = {tasks:Object.values(state.slots)
    .filter(row=>row.kind==='video' && row.videoId && ['pending','completed'].includes(row.state)
      && !row.uploadClaim?.confirmed && row.expiresAtMs>nowMs && !state.matches[row.matchId]?.closed)
    .map(row=>({matchId:row.matchId,ordinal:row.ordinal,expiresAtMs:row.expiresAtMs}))};
  else if (operation === 'reserve') {
    validateSlotInput(input);
    if (/^(?:fd|af|bz)-[0-9]+$/.test(input.matchId)) throw new Error('partido sin código descriptivo; publicación y generación pausadas');
    if (input.publicationIndex!==undefined && (input.kind!=='video' || ![1,2].includes(input.publicationIndex))) throw new Error('posición de recurso inválida');
    if (!uuid(input.attemptId) || !finite(input.expiresAtMs)) throw new Error('intento inválido');
    const key = slotKey(input), row = state.slots[key], previousAttempt = state.attempts[input.attemptId];
    const guard = input.guard;
    const deny = reason => resultFor(row, reason);
    if (previousAttempt) result = deny('intento ya reservado; permiso no renovable');
    else if (state.matches[input.matchId]?.closed) result = deny('partido cerrado por poda');
    else if (input.publicationIndex && Object.values(state.slots).some(slot=>slot.matchId===input.matchId && slot.publicationIndex===input.publicationIndex)) result=deny('posición de clip ocupada; recuperar recurso existente');
    else if (row && !sameIdentity(row,input)) result = deny('slot pertenece a otra versión de prompts');
    else if (row && row.state !== 'rejected') result = deny(row.state === 'uncertain' ? 'resultado incierto; no se repite' : 'slot ya utilizado');
    else if (!row && state.cutover.legacyMatchIds.includes(input.matchId)) result = deny('legacy_unknown; solo reutilización');
    else if (nowMs >= input.expiresAtMs || (state.matches[input.matchId]?.expiresAtMs && nowMs>=state.matches[input.matchId].expiresAtMs)) result = deny('encuentro caducado');
    else if (!object(guard) || typeof guard.manual!=='boolean' || !finite(guard.kickoffMs) || input.expiresAtMs > guard.kickoffMs+86_400_000 || (!guard.manual && (!finite(guard.observedAtMs) || nowMs-guard.observedAtMs > 60_000 || guard.observedAtMs-nowMs > 5000 || guard.kickoffMs <= nowMs || !digest(guard.contextHash)))) result = deny('fixture vigente no verificado');
    else if (input.kind === 'video' && Object.values(state.slots).some(s=>s.kind==='video' && ['pending','uncertain'].includes(s.state) && s.expiresAtMs>nowMs)) result = deny('otra tarea pendiente o incierta');
    else if (input.kind === 'image' && Object.values(state.slots).some(s=>s.kind==='image' && s.state==='uncertain' && s.expiresAtMs>nowMs)) result = deny('otra imagen de resultado incierto; generación simultánea cerrada');
    else if (input.kind === 'video' && Object.values(state.slots).filter(s => s.matchId===input.matchId && s.kind==='video' && ['pending','uncertain','completed'].includes(s.state)).length >= 2) result = deny('máximo dos clips por partido');
    else {
      const retryAtMs = input.kind === 'image' ? Math.max(state.rates.imageThrottleUntil, state.rates.imageStarts.filter(t => t>nowMs-60_000).length >= state.limits.imageRpm ? state.rates.imageStarts.filter(t => t>nowMs-60_000).at(-state.limits.imageRpm)+60_050 : 0) : state.rates.videoNextAt;
      const day = dayAt(nowMs), quota = state.quota[day] ?? {images:0,video_seconds:0};
      const units = input.kind==='image' ? 1 : 6, quotaName = input.kind==='image' ? 'images' : 'video_seconds';
      if (retryAtMs > nowMs) result = {...deny('Agnes está pausado por ritmo de llamadas'),retryAtMs};
      else if (quota[quotaName]+units > state.limits[quotaName]) result = deny(input.kind==='image' ? 'cuota diaria de imágenes agotada' : 'cuota de vídeo diaria agotada');
      else {
        state.quota[day] = {...quota,[quotaName]:quota[quotaName]+units};
        state.slots[key] = {...pickIdentity(input),...(input.publicationIndex?{publicationIndex:input.publicationIndex}:{}),attemptId:input.attemptId,state:'uncertain',videoId:null,expiresAtMs:input.expiresAtMs,reservedDay:day,reservedUnits:units,refunded:false,pollNextAtMs:0,pollLease:null,uploadClaim:null};
        state.attempts[input.attemptId] = {slotKey:key,state:'uncertain',refunded:false,eventIds:[]};
        const m = matchState(input.matchId); m.expiresAtMs = m.expiresAtMs ? Math.min(m.expiresAtMs,input.expiresAtMs) : input.expiresAtMs;
        if (input.kind === 'image') state.rates.imageStarts = [...state.rates.imageStarts.filter(t=>t>nowMs-60_000),nowMs];
        else { state.rates.videoNextAt = nowMs+state.limits.videoStartIntervalMs; state.activeVideoAttemptId = input.attemptId; }
        result = change({canPost:true,attemptId:input.attemptId,state:'uncertain',reservedDay:day});
      }
    }
  } else if (operation === 'event') {
    const attempt = state.attempts[input.attemptId];
    if (!attempt || !uuid(input.eventId)) throw new Error('evento sin intento conocido');
    const row = state.slots[attempt.slotKey];
    if (!row || row.attemptId !== input.attemptId) throw new Error('evento de intento obsoleto');
    if (row.state==='retired') throw new Error('slot retirado; evento no aplicable');
    if (attempt.eventIds.includes(input.eventId)) result = {saved:true,state:row.state};
    else {
      const terminal = ['completed','failed','rejected','abandoned'].includes(row.state);
      if (!['accepted','completed','failed','uncertain','hard-rejected-429','poll-throttle','abandoned'].includes(input.type)) throw new Error('tipo de evento inválido');
      if (terminal && input.type !== 'poll-throttle' && input.type !== row.state) throw new Error('estado terminal no se sobrescribe');
      if (input.type === 'accepted') {
        if (row.kind!=='video' || !id(input.videoId) || (row.videoId && row.videoId!==input.videoId)) throw new Error('identificador Agnes inválido');
        row.videoId=input.videoId; row.state='pending';
      } else if (input.type === 'abandoned') {
        if (row.kind !== 'video' || row.videoId || row.state !== 'uncertain') throw new Error('solo se archiva vídeo sin identificador');
        row.state='abandoned';
        if (state.activeVideoAttemptId===row.attemptId) state.activeVideoAttemptId=null;
      } else if (input.type === 'completed' || input.type === 'failed') {
        row.state=input.type;
        if (state.activeVideoAttemptId===row.attemptId) state.activeVideoAttemptId=null;
      } else if (input.type === 'hard-rejected-429') {
        if (input.httpStatus!==429 || row.videoId || input.provenRejected!==true || row.refunded) throw new Error('rechazo no probado');
        const quotaName=row.kind==='image'?'images':'video_seconds';
        state.quota[row.reservedDay][quotaName] -= row.reservedUnits;
        row.refunded=true; attempt.refunded=true; row.state='rejected';
        const retryAt=nowMs+Math.max(0,Number(input.retryAfterMs)||60_000);
        if (row.kind==='image') state.rates.imageThrottleUntil=Math.max(state.rates.imageThrottleUntil,retryAt);
        else state.rates.videoNextAt=Math.max(state.rates.videoNextAt,retryAt);
        if (state.activeVideoAttemptId===row.attemptId) state.activeVideoAttemptId=null;
      } else if (input.type === 'poll-throttle') row.pollNextAtMs=Math.max(row.pollNextAtMs,nowMs+Math.max(0,Number(input.retryAfterMs)||60_000));
      else if (!row.videoId) row.state='uncertain';
      attempt.state=row.state; attempt.eventIds.push(input.eventId);
      if (input.httpStatus !== undefined || input.type === 'uncertain') {
        state.failureEvents.push({eventId:createHash('sha256').update(input.eventId).digest('hex'),at:nowMs,hourUTC:new Date(nowMs).getUTCHours(),stage:input.stage==='retrieve'?'retrieve':'create',httpStatus:Number.isInteger(input.httpStatus)?input.httpStatus:null,matchId:row.matchId});
      }
      result=change({saved:true,state:row.state});
    }
  } else if (operation === 'pollclaim') {
    const row=readSlot();
    if (!row?.videoId || !uuid(input.owner) || ['failed','rejected','abandoned'].includes(row.state) || row.expiresAtMs<=nowMs || state.matches[input.matchId]?.closed) result={canPoll:false,reason:'sin tarea recuperable vigente'};
    else if (row.pollNextAtMs>nowMs) result={canPoll:false,retryAtMs:row.pollNextAtMs,reason:'Retry-After vigente'};
    else if (row.pollLease && row.pollLease.owner!==input.owner && row.pollLease.untilMs>nowMs) result={canPoll:false,retryAtMs:row.pollLease.untilMs,reason:'otro recuperador activo'};
    else if (row.pollLease?.owner===input.owner && row.pollLease.untilMs>nowMs+10_000) result={canPoll:true,videoId:row.videoId,untilMs:row.pollLease.untilMs,attemptId:row.attemptId};
    else { row.pollLease={owner:input.owner,untilMs:nowMs+60_000}; result=change({canPoll:true,videoId:row.videoId,untilMs:row.pollLease.untilMs,attemptId:row.attemptId}); }
  } else if (operation === 'uploadclaim' || operation === 'uploadconfirm') {
    const row=readSlot();
    if (!row || row.state!=='completed' || !uuid(input.claimId) || !digest(input.sha256)) throw new Error('subida sin slot completado conocido');
    const hasLocation=input.objectKey!==undefined || input.sizeBytes!==undefined;
    if (hasLocation && !validPublication(row,input)) throw new Error('ubicación o tamaño de subida inválido');
    if (hasLocation && row.uploadClaim?.objectKey && (row.uploadClaim.objectKey!==input.objectKey || row.uploadClaim.sizeBytes!==input.sizeBytes)) throw new Error('identidad de objeto R2 distinta');
    if (state.matches[input.matchId]?.closed) result={canPut:false,reason:'partido cerrado por poda'};
    else if (operation === 'uploadclaim') {
      if (row.uploadClaim && (row.uploadClaim.id!==input.claimId || row.uploadClaim.sha256!==input.sha256)) result={canPut:false,reason:'otra subida pendiente'};
      else if (row.uploadClaim) result={canPut:true,claimId:input.claimId};
      else { row.uploadClaim={id:input.claimId,sha256:input.sha256,confirmed:false,...(input.publicationIndex?{publicationIndex:input.publicationIndex}:{}),...(hasLocation?{objectKey:input.objectKey,sizeBytes:input.sizeBytes}:{})}; result=change({canPut:true,claimId:input.claimId}); }
    } else {
      if (row.uploadClaim?.id!==input.claimId || row.uploadClaim.sha256!==input.sha256) throw new Error('confirmación de subida inválida');
      row.uploadClaim.confirmed=true;
      if (hasLocation) Object.assign(row.uploadClaim,{objectKey:input.objectKey,sizeBytes:input.sizeBytes,...(input.publicationIndex?{publicationIndex:input.publicationIndex}:{})});
      result=change({saved:true});
    }
  } else if (operation === 'cleanupclaim' || operation === 'cleanupconfirm') {
    if (!id(input.matchId) || !uuid(input.claimId)) throw new Error('poda inválida');
    const m=state.matches[input.matchId];
    if (operation === 'cleanupconfirm') {
      if (!m?.closed || m.fenceRevision!==input.claimId) throw new Error('fence de poda inválido');
      m.cleanupConfirmed=true; result=change({saved:true});
    } else {
      const related = [...new Set([input.matchId, ...(input.relatedMatchIds ?? [])])];
      if (!Array.isArray(input.relatedMatchIds ?? []) || related.length > 20 || !related.every(id)) throw new Error('aliases de poda inválidos');
      const rows=Object.values(state.slots).filter(s=>related.includes(s.matchId));
      const active=Object.values(state.runs).some(r=>related.includes(r.matchId) && r.untilMs>nowMs);
      const unsafe=rows.some(s=>(s.uploadClaim && !s.uploadClaim.confirmed) || (['pending','uncertain'].includes(s.state) && s.expiresAtMs>nowMs));
      if (active || unsafe || input.pruneDue!==true) result={canDelete:false,reason:'estado activo, incierto o poda no verificada'};
      else {
        const claims = {};
        for (const identity of related) {
          const row = matchState(identity);
          if (!row.closed) { row.closed = true; row.fenceRevision = input.claimId; changed = true; }
          claims[identity] = row.fenceRevision;
        }
        result={canDelete:true,claimId:claims[input.matchId],claims};
      }
    }
  } else if (operation === 'heartbeat') {
    if (!uuid(input.runId) || (input.matchId!==undefined && !id(input.matchId))) throw new Error('corrida inválida');
    if (input.finished) { delete state.runs[input.runId]; result=change({saved:true}); }
    else { state.runs[input.runId]={matchId:input.matchId ?? null,untilMs:nowMs+120_000}; result=change({saved:true}); }
  } else if (operation === 'run-summary') {
    if (!uuid(input.runId)) throw new Error('resumen de corrida inválido');
    const summary={runId:input.runId,at:nowMs};
    for(const key of ['eligible','pending','generated','reused','completed']) {if(!Number.isSafeInteger(input[key]) || input[key]<0)throw new Error('resumen de corrida inválido');summary[key]=input[key];}
    state.summaries[input.runId]=summary; result=change({saved:true});
  } else throw new Error('operación Agnes inválida');
  if (changed) {
    state.revision=randomUUID(); state.updatedAt=new Date(nowMs).toISOString();
    state.usage.opsA+=1;state.usage.opsB+=1;
    state.failureEvents=state.failureEvents.filter(e=>e.at>=nowMs-48*3_600_000).slice(-4096);
    for (const [run,r] of Object.entries(state.runs)) if (r.untilMs<=nowMs) delete state.runs[run];
    for (const [run,r] of Object.entries(state.summaries)) if (r.at<nowMs-48*3_600_000) delete state.summaries[run];
    if (Buffer.byteLength(JSON.stringify(state))>AGNES_STATE_MAX_BYTES*0.8) compactAgnesState(state,{nowMs});
    validateAgnesState(state);
  }
  return {state,result,changed};
}
