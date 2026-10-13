import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaRunOutcome } from '../src/lib/media-diagnostics.js';
const fixture=()=>({runId:'now',mode:'all',pending:1,results:[{matchId:'a-b',mode:'all',failures:[],resources:[
  ...Array.from({length:4},(_,i)=>({kind:'image',number:i+1,verified:true})),
  ...[1,2].map(number=>({kind:'video',number,verified:false,reason:'pendiente'}))],attempts:[1,2].map(publicationIndex=>({kind:'video',publicationIndex,state:'abandoned',diagnostics:{events:[{runId:'now',method:'POST',stage:'create',httpStatus:503,providerCode:'video_queue_full'}]}}))}]});
test('current POST 503 defers missing resources without claiming completeness',()=>{
  const report=fixture(),outcome=mediaRunOutcome(report);
  assert.equal(outcome.exitCode,0);assert.equal(outcome.status,'deferred');assert.equal(outcome.deferred.length,2);
  assert.equal(outcome.deferred[0].providerCode,'video_queue_full');assert.equal(report.pending,1);
});
test('429 is temporary but 402, auth failures and unknown causes require attention',()=>{
  for(const httpStatus of [429,402,401,400,500]) {
    const report=fixture();for(const a of report.results[0].attempts)a.diagnostics.events[0].httpStatus=httpStatus;
    assert.equal(mediaRunOutcome(report).exitCode,httpStatus===429?0:2);
  }
  const report=fixture();report.results[0].attempts=[];assert.equal(mediaRunOutcome(report).exitCode,2);
});
test('old 503 and failed publication cannot mask current errors',()=>{
  const report=fixture();report.results[0].attempts[0].diagnostics.events[0].runId='old';
  assert.equal(mediaRunOutcome(report).exitCode,2);
  report.results[0].attempts[0].diagnostics.events.push({runId:'now',stage:'publication-pending',method:'NONE'});
  assert.equal(mediaRunOutcome(report).errors[0].code,'publication-error');
});
test('R2, identity and state failures outrank provider deferrals',()=>{
  for(const failure of ['R2: HEAD fallido','Estado de recursos no guardado: CAS fallido','Identidad de equipos incompleta o ambigua','Historial final no disponible: acceso denegado','Clips: respuesta inesperada']) {
    const report=fixture();report.results[0].failures=[failure];assert.equal(mediaRunOutcome(report).exitCode,2);
  }
});
test('live task and clips blocked behind it are deferred without a fabricated HTTP',()=>{
  const report=fixture();report.results[0].attempts=[{kind:'video',publicationIndex:1,hasVideoId:true,state:'pending',attemptId:'accepted-id'}];
  const outcome=mediaRunOutcome(report);
  assert.equal(outcome.exitCode,0);assert.deepEqual(outcome.deferred.map(r=>r.code),['task-active','blocked-by-active-task']);
  assert.equal(outcome.deferred[1].httpStatus,null);
  assert.equal(outcome.deferred[1].blockedBy[0].attemptId,'accepted-id');
});
test('verified assets and omitted modes are unaffected by historical rejections',()=>{
  const report=fixture();report.pending=0;report.results[0].mode='images-only';assert.equal(mediaRunOutcome(report).status,'complete');
  for(const resource of report.results[0].resources)resource.verified=true;
  report.pending=0;report.results[0].mode='all';assert.equal(mediaRunOutcome(report).status,'complete');
});
test('recovery-only pass does not demand new resources outside selection',()=>{
  const report=fixture();report.results[0].recoveryOnly=true;
  report.results[0].attempts=[{kind:'video',publicationIndex:1,hasVideoId:true,state:'pending'}];
  assert.equal(mediaRunOutcome(report).exitCode,0);assert.equal(mediaRunOutcome(report).deferred.length,1);
});

test('legacy accepted task without a publication index remains recoverable and never needs another POST',()=>{
  const report=fixture();report.results[0].attempts=[{kind:'video',ordinal:4,hasVideoId:true,state:'pending'}];
  assert.equal(mediaRunOutcome(report).exitCode,0);
  report.results[0].recoveryOnly=true;
  assert.equal(mediaRunOutcome(report).status,'deferred');
});

// Regression for the actual workflow's combination of successful media and omissions.
test('last workflow log stays deferred with informational failures and an admission without HTTP',()=>{
  const report=fixture();
  const lens=report.results[0];lens.matchId='lens';lens.resources[4].verified=true;
  lens.failures=['intento de vídeo 2: HTTP 503','Clip 2: pendiente; POST en esta corrida 1/3; reintentar en otra corrida'];
  const sabah=structuredClone(lens);sabah.matchId='sabah';sabah.resources[4].verified=false;
  sabah.attempts=sabah.attempts.slice(0,1);
  sabah.failures=['Agnes está pausado por ritmo de llamadas'];
  sabah.diagnostics=[{runId:'now',stage:'admission',ordinal:1,code:'rate-wait',httpStatus:null}];
  const viking=structuredClone(fixture().results[0]);viking.matchId='viking';
  const inter=structuredClone(viking);inter.matchId='inter';inter.resources.forEach(r=>r.verified=true);
  const villarreal=structuredClone(viking);villarreal.matchId='villarreal';
  villarreal.attempts=[{kind:'video',publicationIndex:1,hasVideoId:true,state:'pending'}];
  villarreal.failures=['Clip 1: pendiente; POST en esta corrida 1/3; reintentar en otra corrida','otra tarea pendiente o incierta'];
  report.results=[lens,sabah,viking,inter,villarreal];
  const outcome=mediaRunOutcome(report);
  assert.equal(outcome.exitCode,0);assert.equal(outcome.errors.length,0);assert.equal(outcome.deferred.length,7);
  assert.equal(outcome.deferred.find(r=>r.matchId==='sabah'&&r.number===2).code,'rate-wait');
  assert.equal(outcome.deferred.find(r=>r.matchId==='sabah'&&r.number===2).httpStatus,null);
  villarreal.failures.push('R2: HEAD fallido');assert.equal(mediaRunOutcome(report).exitCode,2);
});
test('omission texts alone cannot excuse an unknown missing resource',()=>{
  const report=fixture();report.results[0].attempts=[];
  report.results[0].failures=['Clip 1: pendiente; POST en esta corrida 0/3; reintentar en otra corrida'];
  assert.equal(mediaRunOutcome(report).exitCode,2);
});
