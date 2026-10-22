import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { directVideo, nativeDecision, designMemory, remember } from '../fly/gateway/creative-director.mjs';
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

test('two candidates exhaust one technical correction; generations invalidate decisions', () => {
  const job=fresh();
  for(let i=0;i<2;i++){submitPlan(job,input(job),()=>{});candidate(job);}
  assert.throws(()=>submitPlan(job,input(job),()=>{}),/corrección técnica/);
  assert.throws(()=>approveCandidate(job,{...approval(job),generation:0}),/generación obsoleta/);
  assert.equal(digest({b:1,a:2}),digest({a:2,b:1}));
  const times=reviewTimes(plan,15);
  assert.equal(times.length,8);assert.ok(times.includes(14.5));assert.ok(times.every(t=>t>=0&&t<15));
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
    if(method==='chat.abort')return {};
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
    if(++attempts<2)throw Error('native idle RPC unavailable');
    const path=params.message.match(/archivo (.+?), mediante/)[1];writeFileSync(path,JSON.stringify({notes:'Gateway listo'}));
    return {runId:'ready'};
  }})({directory:directory(t),key:'cold-start',message:'Planifica',sessionKey:'agent:main:cold-start'});
  assert.equal(result.notes,'Gateway listo');assert.deepEqual(models,['primary','primary']);
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
  const authoredPlan={version:5,visualStyle:'documentary',code:"import React from 'react';export default function Piece(){return <div/>}",scenes:plan.scenes};
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

test('advisory suggestions deliver the same candidate without a second render or verdict', async t => {
  const h=harness({reviseUntil:1}),dir=directory(t),body={requestId:'one-audio',expiresAt:Date.now()+3600_000};
  const result=await directVideo(body,{...h,directory:dir});
  assert.equal(result.status,'done');assert.equal(h.job.revision,1);
  assert.equal(h.events.filter(p=>p==='/render/approve').length,1);
  assert.equal(h.job.approval.videoHash,'video-1');
  assert.equal(h.job.approval.reviewPolicy,'advisory');
  assert.equal(h.job.approval.reviewDecision,'revise');
  assert.equal(h.seen.filter(k=>k.includes(':review-')).length,1);
  assert.equal(h.seen.filter(k=>k.includes(':verdict-')).length,0);
  assert.equal(JSON.parse(readFileSync(join(dir,'state.json'))).history.length,2);
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

test('cancellation during advisory review never delivers',async t=>{
  const h=harness({cancelAtReview:true});
  const result=await directVideo({requestId:'cancelled',expiresAt:Date.now()+3600_000},{...h,directory:directory(t)});
  assert.equal(result.status,'cancelled');assert.equal(h.events.includes('/render/approve'),false);
});

test('unavailable visual models do not block a technically valid video or claim to have reviewed images',async t=>{
  const h=harness(),decide=async args=>{
    if(args.key.includes(':review-'))throw Error('both visual providers unavailable');
    return h.decide(args);
  };
  const result=await directVideo({requestId:'no-vision',expiresAt:Date.now()+3600_000},{...h,decide,directory:directory(t)});
  assert.equal(result.status,'done');assert.equal(h.job.revision,1);
  assert.equal(h.job.approval.reviewStatus,'unavailable');
  assert.deepEqual(h.job.approval.reviewedFrames,[]);
  assert.match(h.job.approval.reviewError,/providers unavailable/);
});

test('stage budgets send max for authoring and review, aborting a timed-out primary before fallback',async t=>{
  let clock=0;const calls=[];
  const decide=nativeDecision({now:()=>clock,env:{OPENCODE_GO_MODEL:'primary',OPENCODE_GO_FALLBACK_MODEL:'backup'},wait:async()=>{},call:async(method,params)=>{
    calls.push({method,...params});
    if(method==='chat.abort')return {aborted:true};
    if(method==='agent.wait'){clock+=300000;return {status:'timeout'};}
    if(params.model==='primary')return {runId:'hung-primary'};
    const path=params.message.match(/archivo (.+?), mediante/)[1];writeFileSync(path,JSON.stringify({notes:'Backup terminado'}));return {runId:'backup'};
  }});
  await decide({directory:directory(t),key:'authoring',message:'Crea',sessionKey:'agent:main:author'});
  const primary=calls.find(c=>c.method==='agent');assert.equal(primary.thinking,'max');assert.equal(primary.timeout,240);
  assert.ok(calls.findIndex(c=>c.method==='chat.abort')<calls.findIndex(c=>c.model==='backup'));
  calls.length=0;clock=0;
  await decide({directory:directory(t),key:'review',message:'Revisa',purpose:'review',sessionKey:'agent:main:review'});
  const review=calls.find(c=>c.method==='agent');assert.equal(review.thinking,'max');assert.equal(review.timeout,60);
});

test('authoring requests the preview bytes and records how long the turn took', async t => {
  const h = harness();
  const dir = directory(t);
  const seen = [];
  let clock = 1000;
  const worker = async (path, body, binary) => {
    if (path.endsWith('/context')) return { generation: 1, revision: h.job.revision, source: { span: 12, words: [{ word: 'Gol', start: .5, end: 1 }] }, photos: ['0.jpg'], previews: ['preview-0.jpg'], frames: 450, total: 15 };
    if (binary) return Buffer.from(path.includes('preview-') ? 'small-preview' : 'real-render-frame');
    return h.worker(path, body, binary);
  };
  const decide = async request => { clock += 2500; seen.push(request); return h.decide(request); };
  await directVideo({ requestId: 'preview-audio', chatId: '1', expiresAt: clock + 3_600_000 }, { ...h, worker, decide, directory: dir, now: () => clock });
  const authoring = seen.find(request => request.key.includes(':plan-'));
  assert.equal(authoring.images[0].name, '0.jpg');
  assert.equal(authoring.images[0].bytes.toString(), 'small-preview');
  assert.match(authoring.message, /Preferencias del usuario/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')).history[0].ms, 2500);
});

test('a finished turn reply is saved when OpenClaw did not write the decision file', async t => {
  const dir = directory(t);
  const methods = [];
  const decide = nativeDecision({ env: { OPENCODE_GO_MODEL: 'primary', OPENCODE_GO_FALLBACK_MODEL: 'backup' }, call: async method => {
    methods.push(method);
    if (method === 'agent') return { runId: 'reply-turn' };
    if (method === 'agent.wait') return { status: 'ok', terminalReply: { disposition: 'visible', text: 'Composición lista.\n{"notes":"desde la respuesta","plan":{"version":5}}' } };
    throw new Error('transcript down');
  }});
  const result = await decide({ directory: dir, key: 'reply', message: 'Planifica', sessionKey: 'agent:main:reply', validate: value => {
    if (value.plan?.version !== 5) throw new Error('plan incompleto');
  }});
  assert.equal(result.notes, 'desde la respuesta');
  assert.equal(result.requestedModel, 'primary');
  assert.deepEqual(methods, ['agent', 'agent.wait', 'sessions.get', 'chat.history']);
  const saved = readdirDecision(dir);
  assert.equal(saved.notes, 'desde la respuesta');
});

test('the session transcript supplies the plan when the reply is only an acknowledgement', async t => {
  const decide = nativeDecision({ env: { OPENCODE_GO_MODEL: 'primary', OPENCODE_GO_FALLBACK_MODEL: 'backup' }, call: async method => {
    if (method === 'agent') return { runId: 'transcript-turn' };
    if (method === 'agent.wait') return { status: 'ok', terminalReply: { disposition: 'visible', text: 'Decisión guardada' } };
    if (method === 'sessions.get') return { messages: [
      { role: 'user', content: 'Escribe {"plan":{"version":5' },
      { role: 'assistant', content: [{ type: 'text', text: '{"notes":"transcripción","plan":{"version":5,"code":"export default () => null"}}' }] },
    ] };
    if (method === 'chat.history') return { messages: [] };
    throw new Error(method);
  }});
  const result = await decide({ directory: directory(t), key: 'transcript', message: 'Planifica', sessionKey: 'agent:main:transcript', validate: value => {
    if (typeof value.plan?.code !== 'string') throw new Error('sin código');
  }});
  assert.equal(result.notes, 'transcripción');
  assert.equal(result.requestedModel, 'primary');
});

test('a finished turn without a decision still falls back to the second model', async t => {
  const models = [];
  const decide = nativeDecision({ env: { OPENCODE_GO_MODEL: 'primary', OPENCODE_GO_FALLBACK_MODEL: 'backup' }, call: async (method, params) => {
    if (method === 'agent') {
      models.push(params.model);
      if (params.model === 'backup') {
        const path = params.message.match(/archivo (.+?), mediante/)[1];
        writeFileSync(path, JSON.stringify({ notes: 'respaldo' }));
      }
      return { runId: params.model };
    }
    if (method === 'agent.wait') return { status: 'ok', terminalReply: { disposition: 'visible', text: 'sin json' } };
    if (method === 'sessions.get' || method === 'chat.history') return { messages: [] };
    throw new Error(method);
  }});
  const result = await decide({ directory: directory(t), key: 'empty-reply', message: 'Planifica', sessionKey: 'agent:main:empty' });
  assert.equal(result.notes, 'respaldo');
  assert.deepEqual(models, ['primary', 'backup']);
});

function readdirDecision(dir) {
  const name = readdirSync(dir).find(entry => entry.endsWith('.decision.json'));
  return JSON.parse(readFileSync(join(dir, name), 'utf8'));
}

test('design memory keeps liked and rejected concepts apart and merges a later concept', t => {
  const root = directory(t);
  remember(root, '7', { requestId: 'a'.repeat(32), rating: -1, reason: 'texto cortado', concept: null });
  const merged = remember(root, '7', { requestId: 'a'.repeat(32), concept: 'cierre con cifra', matchId: 'a-b', at: 5 });
  remember(root, '7', { requestId: 'b'.repeat(32), rating: 1, concept: 'subtitulos grandes', at: 9 });
  const memory = designMemory(root, root, '7', 'c'.repeat(32));
  assert.equal(memory.disliked[0].reason, 'texto cortado');
  assert.equal(memory.disliked[0].concept, 'cierre con cifra');
  assert.equal(memory.liked[0].concept, 'subtitulos grandes');
  assert.equal(merged.items.length, 1);
  assert.equal(designMemory(root, root, '7', 'b'.repeat(32)).liked.length, 0);
});
