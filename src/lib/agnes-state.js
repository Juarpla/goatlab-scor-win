import { randomUUID, createHash } from 'node:crypto';

export const AGNES_STATE_MAX_BYTES = 900_000;
const dayAt = now => new Date(now).toISOString().slice(0, 10);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value);
const uuid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key=>allowed.includes(key));
const isoUtc = value => typeof value==='string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
export const slotKey = ({matchId, kind, ordinal}) => `${matchId}:${kind}:${ordinal}`;

export function validateAgnesState(state) {
  if (!object(state) || state.version !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(state.revision) || !isoUtc(state.updatedAt) || !object(state.limits) || !object(state.cutover) || !Array.isArray(state.cutover.legacyMatchIds)) throw new Error('autoridad Agnes inválida');
  if (!keys(state,['version','revision','updatedAt','cutover','limits','quota','rates','matches','slots','attempts','runs','summaries','usage','activeVideoAttemptId','failureEvents']) || !keys(state.cutover,['atMs','legacyMatchIds']) || !keys(state.limits,['images','video_seconds','imageRpm','videoStartIntervalMs']) || !keys(state.rates,['imageStarts','imageThrottleUntil','videoNextAt']) || !keys(state.usage,['opsA','opsB'])) throw new Error('campos privados Agnes no admitidos');
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
      if (!keys(row,['matchId','kind','ordinal','attemptId','state','expiresAtMs']) || key!==slotKey(row) || !id(row.matchId) || !['image','video'].includes(row.kind) || !Number.isInteger(row.ordinal) || row.ordinal<0 || row.ordinal>=(row.kind==='image'?4:5) || !finite(row.expiresAtMs) || !uuid(row.attemptId) || state.attempts[row.attemptId]?.slotKey!==key || state.attempts[row.attemptId]?.state!=='retired') throw new Error('tombstone Agnes corrupto');
      continue;
    }
    validateSlotInput(row);
    if (!keys(row,['matchId','kind','ordinal','promptHash','model','referenceHash','attemptId','state','videoId','expiresAtMs','reservedDay','reservedUnits','refunded','pollNextAtMs','pollLease','uploadClaim'])) throw new Error('campos de slot Agnes no admitidos');
    const attempt=state.attempts[row.attemptId];
    if (key!==slotKey(row) || !uuid(row.attemptId) || !['uncertain','pending','completed','failed','rejected'].includes(row.state) || !finite(row.expiresAtMs) || !finite(row.reservedUnits) || !/^\d{4}-\d{2}-\d{2}$/.test(row.reservedDay) || !state.quota[row.reservedDay] || typeof row.refunded!=='boolean' || !finite(row.pollNextAtMs) || (row.videoId!==null && !id(row.videoId)) || (row.state==='pending' && !row.videoId) || (row.state==='rejected' && (!row.refunded || row.videoId)) || !object(attempt) || attempt.slotKey!==key || !Array.isArray(attempt.eventIds) || attempt.state!==row.state || attempt.refunded!==row.refunded) throw new Error('slot Agnes corrupto');
    if (row.pollLease!==null && (!keys(row.pollLease,['owner','untilMs']) || !uuid(row.pollLease.owner) || !finite(row.pollLease.untilMs))) throw new Error('lease Agnes corrupto');
    if (row.uploadClaim!==null && (!keys(row.uploadClaim,['id','sha256','confirmed']) || !uuid(row.uploadClaim.id) || !digest(row.uploadClaim.sha256) || typeof row.uploadClaim.confirmed!=='boolean')) throw new Error('subida Agnes corrupta');
  }
  for(const [attemptId,row] of Object.entries(state.attempts)) if(!uuid(attemptId) || !keys(row,['slotKey','state','refunded','eventIds']) || !state.slots[row.slotKey] || !['uncertain','pending','completed','failed','rejected','retired'].includes(row.state) || typeof row.refunded!=='boolean' || !Array.isArray(row.eventIds) || !row.eventIds.every(uuid)) throw new Error('intento Agnes corrupto');
  if (state.activeVideoAttemptId!==null && (!state.attempts[state.activeVideoAttemptId] || !Object.values(state.slots).some(s=>s.attemptId===state.activeVideoAttemptId && s.kind==='video' && ['pending','uncertain'].includes(s.state)))) throw new Error('single-flight Agnes corrupto');
  for (const [matchId,row] of Object.entries(state.matches)) if (!id(matchId) || !keys(row,['closed','fenceRevision','expiresAtMs','cleanupConfirmed']) || typeof row.closed!=='boolean' || !finite(row.expiresAtMs) || (row.closed && !uuid(row.fenceRevision))) throw new Error('partido Agnes corrupto');
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
    state.slots[key]={matchId:row.matchId,kind:row.kind,ordinal:row.ordinal,attemptId:row.attemptId,state:'retired',expiresAtMs:row.expiresAtMs};
    for (const [attemptId,attempt] of Object.entries(state.attempts)) if (attempt.slotKey===key) state.attempts[attemptId]={slotKey:key,state:'retired',refunded:attempt.refunded,eventIds:[]};
    if (state.activeVideoAttemptId===row.attemptId) state.activeVideoAttemptId=null;
    changed=true;
  }
  return changed;
}

function validateSlotInput(input) {
  if (!id(input.matchId) || !['image','video'].includes(input.kind) || !Number.isInteger(input.ordinal) || input.ordinal < 0 || input.ordinal >= (input.kind === 'image' ? 4 : 5) || !digest(input.promptHash) || input.model!==`agnes-${input.kind}-2.5-flash` || (input.referenceHash !== undefined && !digest(input.referenceHash))) throw new Error('identidad de slot inválida');
}
function pickIdentity(input) { return {matchId:input.matchId,kind:input.kind,ordinal:input.ordinal,promptHash:input.promptHash,model:input.model, ...(input.referenceHash ? {referenceHash:input.referenceHash} : {})}; }
function sameIdentity(row,input) { return ['promptHash','model','referenceHash'].every(key => row[key] === input[key]); }
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
  if (operation === 'health') result = {ready:true,version:1};
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
  else if (operation === 'report') result = {quota:state.quota,failureEvents:state.failureEvents.filter(e => e.at >= nowMs-48*3_600_000).map(e=>({eventId:e.eventId,at:new Date(e.at).toISOString(),hourUTC:e.hourUTC,stage:e.stage,httpStatus:e.httpStatus,matchId:e.matchId})),runs:Object.values(state.summaries).filter(r=>r.at>=nowMs-48*3_600_000).map(r=>({runId:r.runId,at:new Date(r.at).toISOString(),eligible:r.eligible,pending:r.pending,generated:r.generated,reused:r.reused,completed:r.completed})),usage:{opsA:state.usage.opsA,opsB:state.usage.opsB},updatedAt:state.updatedAt};
  else if (operation === 'status') result = {slot:readSlot() ?? null,closed:state.matches[input.matchId]?.closed ?? false};
  else if (operation === 'reserve') {
    validateSlotInput(input);
    if (!uuid(input.attemptId) || !finite(input.expiresAtMs)) throw new Error('intento inválido');
    const key = slotKey(input), row = state.slots[key], previousAttempt = state.attempts[input.attemptId];
    const guard = input.guard;
    const deny = reason => resultFor(row, reason);
    if (previousAttempt) result = deny('intento ya reservado; permiso no renovable');
    else if (state.matches[input.matchId]?.closed) result = deny('partido cerrado por poda');
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
        state.slots[key] = {...pickIdentity(input),attemptId:input.attemptId,state:'uncertain',videoId:null,expiresAtMs:input.expiresAtMs,reservedDay:day,reservedUnits:units,refunded:false,pollNextAtMs:0,pollLease:null,uploadClaim:null};
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
      const terminal = ['completed','failed','rejected'].includes(row.state);
      if (!['accepted','completed','failed','uncertain','hard-rejected-429','poll-throttle'].includes(input.type)) throw new Error('tipo de evento inválido');
      if (terminal && input.type !== 'poll-throttle' && input.type !== row.state) throw new Error('estado terminal no se sobrescribe');
      if (input.type === 'accepted') {
        if (row.kind!=='video' || !id(input.videoId) || (row.videoId && row.videoId!==input.videoId)) throw new Error('identificador Agnes inválido');
        row.videoId=input.videoId; row.state='pending';
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
    if (!row?.videoId || !uuid(input.owner) || ['failed','rejected'].includes(row.state) || row.expiresAtMs<=nowMs || state.matches[input.matchId]?.closed) result={canPoll:false,reason:'sin tarea recuperable vigente'};
    else if (row.pollNextAtMs>nowMs) result={canPoll:false,retryAtMs:row.pollNextAtMs,reason:'Retry-After vigente'};
    else if (row.pollLease && row.pollLease.owner!==input.owner && row.pollLease.untilMs>nowMs) result={canPoll:false,retryAtMs:row.pollLease.untilMs,reason:'otro recuperador activo'};
    else if (row.pollLease?.owner===input.owner && row.pollLease.untilMs>nowMs+10_000) result={canPoll:true,videoId:row.videoId,untilMs:row.pollLease.untilMs,attemptId:row.attemptId};
    else { row.pollLease={owner:input.owner,untilMs:nowMs+60_000}; result=change({canPoll:true,videoId:row.videoId,untilMs:row.pollLease.untilMs,attemptId:row.attemptId}); }
  } else if (operation === 'uploadclaim' || operation === 'uploadconfirm') {
    const row=readSlot();
    if (!row || row.state!=='completed' || !uuid(input.claimId) || !digest(input.sha256)) throw new Error('subida sin slot completado conocido');
    if (state.matches[input.matchId]?.closed) result={canPut:false,reason:'partido cerrado por poda'};
    else if (operation === 'uploadclaim') {
      if (row.uploadClaim && (row.uploadClaim.id!==input.claimId || row.uploadClaim.sha256!==input.sha256)) result={canPut:false,reason:'otra subida pendiente'};
      else if (row.uploadClaim) result={canPut:true,claimId:input.claimId};
      else { row.uploadClaim={id:input.claimId,sha256:input.sha256,confirmed:false}; result=change({canPut:true,claimId:input.claimId}); }
    } else {
      if (row.uploadClaim?.id!==input.claimId || row.uploadClaim.sha256!==input.sha256) throw new Error('confirmación de subida inválida');
      row.uploadClaim.confirmed=true; result=change({saved:true});
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
