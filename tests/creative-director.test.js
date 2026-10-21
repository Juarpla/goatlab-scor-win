import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { directVideo, nativeDecision } from '../fly/gateway/creative-director.mjs';
import { submitPlan, approveCandidate, digest, reviewTimes } from '../fly/render/creative-job.mjs';
import { compositionProps } from '../src/lib/edit-plan.js';

const plan = { version:4, scenes:[0,1,2].map(i => ({start:i*4,end:i*4+4,layers:[{asset:0}],graphics:[{kind:'line',at:i*4,duration:4}]})) };
const fresh = () => ({ id:'job-'+'a'.repeat(32), workflowProtocol:3, attempts:1, expiresAt:Date.now()+3600_000, prepared:true, revision:0, status:'awaiting-plan' });
const candidate = job => {
  job.status='awaiting-review';job.candidate={revision:job.revision,videoHash:'video-'+job.revision,frames:[{name:`review-${job.revision}-0.jpg`,time:.5}]};
};
const input = job => ({generation:job.attempts,baseRevision:job.revision,plan,model:'deepseek-v4.1-flash'});
const approval = job => ({generation:job.attempts,revision:job.revision,planHash:job.planHash,videoHash:job.candidate.videoHash,reviewedFrames:job.candidate.frames.map(f=>f.name),notes:'Texto legible y encuadre correcto'});
function directory(t) { const dir=mkdtempSync(join(tmpdir(),'goatlab-director-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir; }

test('consecutive photos with motion overlays pass executable validation through 55 seconds', () => {
  const props={frames:450,photos:[{width:1080,height:1920}],words:[{word:'Gol',start:.5,end:1}],plan};
  assert.equal(compositionProps(props).plan.scenes.length,3);
  assert.equal(compositionProps({...props,frames:1650,plan:{version:4,scenes:[{start:0,end:52,layers:[]}]}}).frames,1650);
  assert.throws(()=>compositionProps({...props,frames:1651}),/límite/);
  assert.throws(()=>compositionProps({...props,plan:{version:4,scenes:[{start:0,end:12,clips:[{clip:0,offset:4,duration:4}]}]},clips:[{duration:6}]}),/recorte/);
});

test('revision transitions reject old approvals, duplicate captures and incomplete reviews', () => {
  const job=fresh(), submitted=input(job);
  assert.equal(submitPlan(job,submitted,()=>{}).duplicate,false);
  assert.equal(submitPlan(job,submitted,()=>{}).duplicate,true);
  candidate(job);const old=approval(job);
  assert.throws(()=>approveCandidate(job,{...old,reviewedFrames:[]}),/fotogramas/);
  submitPlan(job,input(job),()=>{});candidate(job);
  assert.throws(()=>approveCandidate(job,old),/obsoleta/);
  const current=approval(job);
  assert.equal(approveCandidate(job,current).duplicate,false);
  assert.equal(approveCandidate(job,current).duplicate,true);
  job.cancelled=true;
  assert.throws(()=>approveCandidate(job,current),/cancelado/);
});

test('three candidates exhaust two corrections; replacement generations invalidate decisions', () => {
  const job=fresh();
  for(let i=0;i<3;i++){submitPlan(job,input(job),()=>{});candidate(job);}
  assert.throws(()=>submitPlan(job,input(job),()=>{}),/dos correcciones/);
  assert.throws(()=>approveCandidate(job,{...approval(job),generation:0}),/generación obsoleta/);
  assert.equal(digest({b:1,a:2}),digest({a:2,b:1}));
  const times=reviewTimes(plan,15);
  assert.ok(times.includes(0));assert.ok(times.includes(13.5));assert.ok(times.every(t=>t>=0&&t<15));
});

test('OpenClaw receives actual image attachments and uses GLM if the primary turn fails', async t => {
  const dir=directory(t),models=[];
  const decide=nativeDecision({env:{OPENCODE_GO_MODEL:'deepseek-v4.1-flash',OPENCODE_GO_FALLBACK_MODEL:'glm-5.3-flash'},call:async(method,params)=>{
    if(method==='agent') {
      models.push(params.model);
      assert.equal(params.deliver,false);assert.equal(params.disableMessageTool,true);
      assert.equal(params.attachments[0].content,Buffer.from('pixels').toString('base64'));
      if(params.model.startsWith('deepseek'))throw Error('primary unavailable');
      const path=params.message.match(/archivo (.+?), mediante/)[1];writeFileSync(path,JSON.stringify({decision:'approve',notes:'Detalle visual'}));
      return {runId:'glm-turn'};
    }
    assert.equal(method,'agent.wait');return {status:'ok'};
  }});
  const result=await decide({directory:dir,key:'vision',message:'Revisa imagen',images:[{name:'test.jpg',bytes:Buffer.from('pixels')}],sessionKey:'agent:main:test'});
  assert.deepEqual(models,['deepseek-v4.1-flash','glm-5.3-flash']);assert.equal(result.requestedModel,'glm-5.3-flash');
});

test('a saved native decision survives a timeout while waiting for turn finalization',async t=>{
  const models=[];let path;
  const decide=nativeDecision({env:{OPENCODE_GO_MODEL:'primary',OPENCODE_GO_FALLBACK_MODEL:'backup'},call:async(method,params)=>{
    if(method==='agent'){
      models.push(params.model);
      if(params.model==='backup')throw Error('unnecessary fallback');
      path=params.message.match(/archivo (.+?), mediante/)[1];return {runId:'primary-run'};
    }
    writeFileSync(path,JSON.stringify({decision:'revise',notes:'Encuadre demasiado pequeño'}));
    throw Error('native idle RPC timeout');
  }});
  const result=await decide({directory:directory(t),key:'finalization',message:'Revisa',sessionKey:'agent:main:test'});
  assert.equal(result.requestedModel,'primary');assert.deepEqual(models,['primary']);
});

test('an unfinished native turn is admitted again after the Gateway runtime restarts',async t=>{
  const dir=directory(t),base={directory:dir,key:'restart',message:'Planifica',sessionKey:'agent:main:restart'};
  const env={OPENCODE_GO_MODEL:'primary',OPENCODE_GO_FALLBACK_MODEL:'primary',GOATLAB_GATEWAY_INSTANCE:'boot-one'};
  await assert.rejects(nativeDecision({env,call:async method=>{
    if(method==='agent')return {runId:'lost-on-restart'};
    throw Error('interrupted turn');
  }})(base),/interrupted/);
  const methods=[];
  const result=await nativeDecision({env:{...env,GOATLAB_GATEWAY_INSTANCE:'boot-two'},call:async(method,params)=>{
    methods.push(method);assert.equal(method,'agent');
    const path=params.message.match(/archivo (.+?), mediante/)[1];writeFileSync(path,JSON.stringify({notes:'Turno recuperado'}));
    return {runId:'new-runtime-turn'};
  }})(base);
  assert.equal(result.notes,'Turno recuperado');assert.deepEqual(methods,['agent']);
});

test('cold-start Gateway readiness is retried before changing creative models',async t=>{
  const models=[];let attempts=0;
  const result=await nativeDecision({env:{OPENCODE_GO_MODEL:'primary',OPENCODE_GO_FALLBACK_MODEL:'backup'},wait:async()=>{},call:async(method,params)=>{
    assert.equal(method,'agent');models.push(params.model);
    if(++attempts<3)throw Error('native idle RPC unavailable');
    const path=params.message.match(/archivo (.+?), mediante/)[1];writeFileSync(path,JSON.stringify({notes:'Gateway listo'}));
    return {runId:'ready'};
  }})({directory:directory(t),key:'cold-start',message:'Planifica',sessionKey:'agent:main:cold-start'});
  assert.equal(result.notes,'Gateway listo');assert.deepEqual(models,['primary','primary','primary']);
});

function harness({reviseUntil=0,cancelAtReview=false,rejectCorrectionOnce=false}={}) {
  const job=fresh(), events=[], seen=[];
  const worker=async(path,body,binary)=>{
    events.push(path);
    if(path==='/render')return {jobId:job.id};
    if(binary)return Buffer.from('real-render-frame');
    if(path.endsWith('/context'))return {generation:1,revision:job.revision,source:{span:12,words:[{word:'Gol',start:.5,end:1}],assets:[]},photos:[],frames:450,total:15};
    if(path==='/render/plan'){
      if(rejectCorrectionOnce&&job.revision===1){rejectCorrectionOnce=false;throw Error('Render HTTP 400: scenes[0].graphics[0]: tiempo fuera de escena');}
      submitPlan(job,body,()=>{});candidate(job);return {};
    }
    if(path==='/render/approve'){approveCandidate(job,body);job.status='done';return {};}
    if(path==='/render/fail'){job.status='error';job.error=body.reason;return {};}
    return structuredClone(job);
  };
  const authoredPlan={version:5,code:"import React from 'react';export default function Piece(){return <div/>}",scenes:plan.scenes};
  const decide=async request=>{
    seen.push(request.key);
    if(request.key.includes(':plan-'))return {plan:authoredPlan,notes:'Dirección narrativa'};
    if(request.key.includes(':review-')) {
      assert.equal(request.images[0].bytes.toString(),'real-render-frame');
      if(cancelAtReview)job.cancelled=true;
      return {decision:job.revision<=reviseUntil?'revise':'approve',notes:'Observaciones de fotogramas'};
    }
    return job.revision<=reviseUntil?{decision:'revise',notes:'Corregir título',plan:authoredPlan}:{decision:'approve',notes:'Candidato revisado'};
  };
  return {job,events,seen,worker,decide};
}

test('director reviews a correction, approves the exact candidate and resumes without delivering twice', async t => {
  const h=harness({reviseUntil:1}),dir=directory(t),body={requestId:'one-audio',expiresAt:Date.now()+3600_000};
  const result=await directVideo(body,{...h,directory:dir});
  assert.equal(result.status,'done');assert.equal(h.job.revision,2);
  assert.equal(h.events.filter(p=>p==='/render/approve').length,1);
  assert.equal(h.job.approval.videoHash,'video-2');
  assert.ok(JSON.parse(readFileSync(join(dir,'state.json'))).history.length>=5);
  await directVideo(body,{...h,directory:dir});
  assert.equal(h.events.filter(p=>p==='/render/approve').length,1);
});

test('a JSX runtime failure returns its diagnostic to OpenClaw before another capture', async t => {
  const h=harness(),messages=[];
  const worker=async(path,body,binary)=>{
    const result=await h.worker(path,body,binary);
    if(path==='/render/plan'&&h.job.revision===1){h.job.status='error';h.job.error='ReferenceError: useCurrentFrame is not defined';h.job.candidate=null;}
    return result;
  };
  const decide=async request=>{messages.push(request.message);return h.decide(request);};
  const result=await directVideo({requestId:'runtime-correction',expiresAt:Date.now()+3600_000},{...h,worker,decide,directory:directory(t)});
  assert.equal(result.status,'done');assert.equal(h.job.revision,2);
  assert.ok(messages.some(message=>message.includes('Corrige el error técnico: ReferenceError: useCurrentFrame is not defined')));
  assert.equal(h.job.approval.videoHash,'video-2');
});

test('exhausted reviews and cancellation never deliver an automatic replacement', async t => {
  for(const options of [{reviseUntil:9},{cancelAtReview:true}]) {
    const h=harness(options);
    const result=await directVideo({requestId:'audio',expiresAt:Date.now()+3600_000},{...h,directory:directory(t)});
    assert.ok(['error','cancelled'].includes(result.status));
    assert.equal(h.events.includes('/render/approve'),false);
    assert.ok(h.job.revision<=3);
  }
});

test('a technical error in a corrected plan goes back to OpenClaw without replacing the reviewed video',async t=>{
  const h=harness({reviseUntil:1,rejectCorrectionOnce:true});
  const result=await directVideo({requestId:'technical-correction',expiresAt:Date.now()+3600_000},{...h,directory:directory(t)});
  assert.equal(result.status,'done');assert.equal(h.job.revision,2);
  assert.equal(h.seen.filter(key=>key.includes(':verdict-1:1:video-1')).length,2);
});
