import { mediaPolicy } from './media-policy.js';

/** Bounded public diagnostics: never publish provider credentials or signed URLs. */
export function safeMediaMessage(value, env = {}) {
  let text=String(value ?? '');
  for(const [key,secret] of Object.entries(env)) if(secret && /(?:KEY|TOKEN|SECRET|PASSWORD)$/.test(key)) text=text.split(String(secret)).join('[redacted]');
  return text.replace(/https?:\/\/[^\s"<>]+/g,'[endpoint]')
    .replace(/(bearer\s+)[^\s"<>]+/gi,'$1[redacted]')
    .replace(/("(?:token|api[_-]?key|secret|authorization|password|prompt|id|b64_json|base64|(?:video|task|result|generation)[_-]?id)"\s*:\s*)"[^"\n]*"/gi,'$1"[redacted]"').slice(0,4096);
}
export function publicVideoDiagnostics(rows, env={}) {
  return (Array.isArray(rows)?rows:[]).slice(-128).map(row=>({
    at: Number(row.at)||0, matchId: String(row.matchId??''), ordinal:Number(row.ordinal)||0,
    runId: safeMediaMessage(row.runId,env), resourceNumber:Number(row.resourceNumber)||null, retryAtMs:Number(row.retryAtMs)||null,
    stage: safeMediaMessage(row.stage,env), code:safeMediaMessage(row.code,env),
    httpStatus: Number.isInteger(row.httpStatus)?row.httpStatus:null,
    message:safeMediaMessage(row.body,env), requestId:safeMediaMessage(row.requestId,env),
    attemptId: safeMediaMessage(row.attemptId ?? 'detalle original no conservado',env),
    next: safeMediaMessage(row.next ?? 'detalle original no conservado',env),
  }));
}
export function requestedMediaComplete({images,clips,mode,matchId}) {
  return (mode==='clips-only'||images>=4) && (mode==='images-only'||clips>=mediaPolicy(matchId).clips);
}

/** Totals include existing and newly uploaded resources with confirmed R2 evidence. */
export function readyMediaLabels({ images, clips, matchId }) {
  return {
    images: `${images}/4 imágenes listas; faltan ${Math.max(0, 4 - images)}`,
    clips: `${clips}/${mediaPolicy(matchId).clips} clips listos; faltan ${Math.max(0, mediaPolicy(matchId).clips - clips)}`,
  };
}

/** Execution outcome is separate from R2 availability; historical HTTP never excuses a current failure. */
export function mediaRunOutcome(report) {
  const results=report.results??[];
  const liveVideos=results.flatMap(row=>(row.attempts??[]).filter(a=>a.kind==='video'&&a.hasVideoId&&a.state==='pending')
    .map(a=>({matchId:row.matchId,attemptId:a.attemptId})));
  const deferred=[],errors=[];
  if(report.error)errors.push({code:'execution-error',message:report.error});
  for(const row of results) {
    const mode=row.mode??report.mode;
    // Known omissions are explained below using resource evidence. Unexpected failures stay fatal.
    for(const message of row.failures??[]) {
      if(message==='Motion Prompts no disponibles; montaje local disponible')continue;
      if(message==='R2: subidas y generación pausadas; reutilización disponible'&&requestedMediaComplete({...row,mode}))continue;
      if(mode==='clips-only'&&message==='Image Prompts no disponibles'||mode==='images-only'&&message==='Video Prompts no disponibles')continue;
      const infrastructure=/R2:|Estado (?:privado|de generación|de recursos)|Historial .*no disponible|falta AGNES_API_KEY|(?:Image|Video) Prompts no disponibles|identidad.*(?:incompleta|ambigua)|Kickoff inválido|Huella de contenido inválida|otra identidad|Resultado incompatible|Imagen inválida/i.test(message);
      const explained=/Solicitud aplazada por el control de ritmo|Agnes está pausado por ritmo de llamadas|(?:clip|intento de vídeo) \d+: pendiente; POST en esta corrida|HTTP \d{3}|"httpStatus"\s*:\s*\d{3}|Recursos incompletos|tarea pendiente|otra tarea pendiente o incierta|presupuesto de preparación agotado|presupuesto de corrida agotado|plazo de generación agotado|ventana de recuperación|^(?:clip|intento de vídeo) \d+: etapa=/i.test(message);
      if(infrastructure||!explained)errors.push({matchId:row.matchId,code:'execution-error',message});
    }
    for(const kind of ['image','video']) {
      if(kind==='image'&&mode==='clips-only'||kind==='video'&&mode==='images-only')continue;
      // A recovery-only pass does not request new resources outside the selection.
      const numbers=Array.from({length:kind==='image'?4:mediaPolicy(row.matchId).clips},(_,i)=>i+1);
      for(const number of numbers) {
        const resource=row.resources?.find(r=>r.kind===kind&&r.number===number);
        if(resource?.verified)continue;
        const own=(row.attempts??[]).filter(a=>a.kind===kind&&(kind==='image'?a.ordinal+1===number:(a.publicationIndex===number||(!a.publicationIndex&&a.hasVideoId&&a.state==='pending'&&number===1))));
        const current=own.filter(a=>a.diagnostics?.events?.some(e=>e.runId===report.runId)).at(-1);
        const events=current?.diagnostics?.events?.filter(e=>e.runId===report.runId)??[];
        const latestHttp=events.filter(e=>e.httpStatus!=null).at(-1);
        const admission=(row.diagnostics??[]).findLast(e=>e.runId===report.runId&&e.stage==='admission'&&(e.resourceNumber??e.ordinal+1)===number&&kind==='video');
        const live=own.find(a=>a.hasVideoId&&a.state==='pending');
        let code;
        if(events.some(e=>e.stage==='publication-pending'))code='publication-error';
        else if(latestHttp&&[429,503].includes(latestHttp.httpStatus))code='provider-'+latestHttp.httpStatus;
        else if(latestHttp&&latestHttp.httpStatus>=400)code='provider-error';
        else if(live)code='task-active';
        else if(admission?.code==='rate-wait')code='rate-wait';
        else if((row.deferrals??[]).some(d=>d.kind===kind&&d.number===number&&['rate-wait','run-deadline'].includes(d.code)))code=(row.deferrals??[]).find(d=>d.kind===kind&&d.number===number).code;
        else if(kind==='video'&&!row.recoveryOnly&&!current&&liveVideos.length)code='blocked-by-active-task';
        else if(kind==='image'&&!current&&(row.attempts??[]).some(a=>a.kind==='image'&&a.diagnostics?.events?.filter(e=>e.runId===report.runId&&e.httpStatus!=null).at(-1)?.httpStatus===429)&&(row.failures??[]).some(m=>m.includes('429')))code='provider-429';
        else if(row.recoveryOnly&&!own.some(a=>a.hasVideoId))continue;
        else code='unresolved-resource';
        const detail={matchId:row.matchId,kind,number,code,httpStatus:latestHttp?.httpStatus??null,
          providerCode:latestHttp?.providerCode??'',message:resource?.reason??'Recurso solicitado sin verificación R2',
          ...(code==='blocked-by-active-task'?{blockedBy:liveVideos}:{} )};
        if(['provider-429','provider-503','task-active','blocked-by-active-task','rate-wait','run-deadline'].includes(code))deferred.push(detail);
        else errors.push(detail);
      }
    }
  }
  // Legacy/incomplete reports without per-resource evidence fail closed.
  if(report.pending>0&&!deferred.length&&!errors.length)errors.push({code:'unresolved-resource',message:'Recursos incompletos; causa no registrada'});
  return {status:errors.length?'error':deferred.length?'deferred':'complete',exitCode:errors.length?2:0,deferred,errors};
}
