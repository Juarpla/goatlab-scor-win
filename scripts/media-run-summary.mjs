import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { safeMediaMessage, requestedMediaComplete, readyMediaLabels, mediaRunOutcome } from '../src/lib/media-diagnostics.js';
let report;
try { report=JSON.parse(await readFile('.cache/media-run.json','utf8')); }
catch { report={mode:process.env.AGNES_SKIP_VIDEO==='1'?'images-only':process.env.AGNES_SKIP_IMAGES==='1'?'clips-only':'all',results:[],pending:1,error:'No se completó la generación. Revisar mantenimiento, comprobación y preflight en esta ejecución.'}; }
const safe=value=>safeMediaMessage(value,process.env).replace(/[\r\n|]/g,' ').replace(/[<>]/g,'');
const outcome=report.outcome??mediaRunOutcome(report);
const outcomeLabel=outcome.status==='deferred'?'finalizado con recursos pendientes por condiciones temporales':outcome.status==='error'?'fallo de ejecución; revisar diagnóstico':'recursos solicitados verificados';
let summary=`## Banco de medios\n\nModo: ${safe(report.mode)} · Resultado: ${outcomeLabel}\n\n`;
if(outcome.deferred.length)summary+='Recursos pospuestos: '+outcome.deferred.map(item=>safe(item.matchId)+' · '+(item.kind==='image'?'imagen ':'clip ')+item.number+' · '+safe(item.code)+(item.blockedBy?' · bloqueado por '+item.blockedBy.map(task=>safe(task.matchId)+' / '+safe(task.attemptId)).join(', '):'')).join('; ')+'. Los pendientes no cuentan como listos en R2.\n\n';
if(report.error) summary+=safe(report.error)+'\n\n';
summary+='| Partido | Imágenes listas en R2 | Clips listos en R2 | Diagnóstico |\n| --- | --- | --- | --- |\n';
for(const row of report.results??[]) {
  const complete = requestedMediaComplete({ ...row, mode: row.mode ?? report.mode });
  const failures = [...new Set((row.failures ?? []).filter(reason => reason !== 'Motion Prompts no disponibles; montaje local disponible' && !/^(?:clip|intento de vídeo) \d+: etapa=/.test(reason)).map(reason=>reason.split('; última consulta:')[0]))];
  const latest = row.diagnostics?.at(-1);
  const diagnosis = complete ? 'Verificado' : failures.join('; ') || latest?.message || 'Recursos incompletos; causa no registrada';
  const labels = readyMediaLabels(row);
  const detail = complete && row.failures?.length ? '; ' + row.failures.join('; ') : '';
  summary+=`| ${safe(row.matchId)} | ${safe(labels.images)} | ${safe(labels.clips)} | ${safe(diagnosis + detail)} |\n`;
}
for(const row of report.results??[]) {
  summary+=`\n### ${safe(row.matchId)}\n\n#### Recursos\n\n| Recurso | Disponibilidad | Objeto R2 | Verificación / motivo |\n| --- | --- | --- | --- |\n`;
  const resources=row.resources??[
    ...Array.from({length:4},(_,index)=>({kind:'image',number:index+1,status:'sin detalle individual',reason:'detalle original no conservado'})),
    ...Array.from({length:2},(_,index)=>({kind:'video',number:index+1,status:'sin detalle individual',reason:'detalle original no conservado'})),
  ];
  for(const resource of resources) summary+=`| ${resource.kind==='image'?'Imagen':'Clip'} ${resource.number} | ${safe(resource.status)} | ${safe(resource.objectKey??'—')} | ${safe(resource.reason)} |\n`;
  const attempts=row.attempts??[];
  const countKnown=Array.isArray(row.attempts);
  summary+='\n#### Peticiones/intentos\n\nMáximo tres POST por imagen o clip en esta corrida. Se renuevan en otra corrida; los GET no consumen intentos.\n\n';
  for(const resource of row.resources??[])summary+=`${resource.kind==='image'?'Imagen':'Clip'} ${resource.number}: ${resource.postsThisRun??0}/3 POST en esta corrida; estado=${resource.state??(resource.verified?'listo':'pendiente')}.\n`;
  summary+='\n';
  summary+='| Imagen / intento de vídeo | Resultado | Etapa / método | HTTP | Respuesta de Agnes / publicación | Fecha UTC | Origen / corrida |\n| --- | --- | --- | --- | --- | --- | --- |\n';
  for(const attempt of attempts) {
    const label=(attempt.kind==='image'?'Imagen '+(attempt.ordinal+1):attempt.publicationIndex?'Clip '+attempt.publicationIndex:'Vídeo histórico')+' · solicitud '+safe(attempt.attemptId??'sin ID');
    if(!attempt.diagnostics?.events?.length) {
      summary+=`| ${label} | ${safe(attempt.state)} | — | desconocido | detalle original no conservado | — | historial anterior |\n`;
      continue;
    }
    for(const event of attempt.diagnostics.events) {
      const details=[event.providerCode,event.message,event.providerStatus?`estado=${event.providerStatus}`:'',event.progress!=null?`progreso=${event.progress}%`:'',event.next?`siguiente: ${event.next}`:''].filter(Boolean).join('; ')||'sin detalle de respuesta';
      const origin=event.runId===report.runId?'corrida actual':'historial anterior';
      const at=Number.isFinite(event.at)?new Date(event.at).toISOString():'—';
      const source=/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/.test(event.runUrl??'')?`[${safe(event.runId)}](${event.runUrl})`:safe(event.runId);
      const http=event.httpStatus??(event.method==='NONE'?'—':'sin respuesta HTTP');
      summary+=`| ${label} | ${safe(attempt.state)} | ${safe(event.stage)} / ${safe(event.method)} | ${http} | ${safe(details)} | ${at} | ${origin}: ${source} |\n`;
    }
  }
  summary+='\n'+attempts.filter(a=>a.kind==='video'&&a.diagnostics).map(a=>`Consultas del intento ${a.ordinal+1}: ${a.diagnostics.queryCount}.`).join(' ')+'\n';
}
if(report.runUrl) summary+=`\n[Ver ejecución y logs en GitHub](${safe(report.runUrl)})\n`;
await mkdir('.cache',{recursive:true});
await writeFile('.cache/media-run.json',JSON.stringify(report,null,2));
if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
console.log(summary);
