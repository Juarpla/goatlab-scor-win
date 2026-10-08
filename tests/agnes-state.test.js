import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createAgnesState, reduceAgnesState, validateAgnesState } from '../src/lib/agnes-state.js';
import { AgnesStateClient } from '../fly/gateway/workspace/skills/goatlab/scripts/agnes-state.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const now=Date.parse('2026-10-09T06:00:00Z');
const fresh=()=>createAgnesState({nowMs:now-86_400_000});
const reserve=(extra={})=>({attemptId:randomUUID(),matchId:'alpha-beta',kind:'image',ordinal:0,promptHash:hash('prompt'),model:'agnes-image-2.5-flash',expiresAtMs:now+86_400_000,guard:{manual:true,kickoffMs:now},...extra});
const env={R2_STATE_ACCOUNT_ID:'account',R2_STATE_ACCESS_KEY_ID:'test-key',R2_STATE_SECRET_ACCESS_KEY:'test-secret'};
function backend(seed=fresh()) {
  let state=seed,etag='"1"',puts=0,loseAck=false;
  return {
    get state(){return state;},get puts(){return puts;},loseAck(){loseAck=true;},
    async fetch(_url,request){
      assert.ok(request.headers.Authorization.startsWith('AWS4-HMAC-SHA256'));
      if(request.method==='GET')return Response.json(state,{headers:{etag,date:new Date(now).toUTCString()}});
      assert.match(request.headers['if-match'],/^"\d+"$/);
      const old=request.headers['if-match'];await new Promise(resolve=>setImmediate(resolve));
      if(old!==etag)return new Response('',{status:412});
      state=JSON.parse(request.body.toString());puts++;etag=`"${puts+1}"`;
      if(loseAck){loseAck=false;throw new Error('response lost');}
      return new Response('',{status:200});
    }
  };
}
test('reads use identity encoding so the CAS etag stays strong',async()=>{
  const remote=backend(),seen={};
  const client=new AgnesStateClient({env,fetchImpl:async(url,request)=>{seen.method=request.method;seen.accept=request.headers['accept-encoding'];return remote.fetch(url,request);}});
  await client.readState();
  assert.equal(seen.method,'GET');
  assert.equal(seen.accept,'identity');
});
test('release-legacy requires confirmation and frees only legacy-uncertain slots',()=>{
  const legacySlots=[
    {matchId:'alpha-beta',kind:'image',ordinal:0,promptHash:hash('p0'),model:'agnes-image-2.5-flash',state:'completed',expiresAtMs:now+86_400_000},
    {matchId:'alpha-beta',kind:'video',ordinal:0,promptHash:hash('v0'),model:'agnes-video-2.5-flash',state:'uncertain',expiresAtMs:now+86_400_000},
  ];
  const seed=createAgnesState({nowMs:now-86_400_000,legacyMatchIds:['alpha-beta'],legacySlots});
  assert.throws(()=>reduceAgnesState(seed,'release-legacy',{},{nowMs:now}),/sin confirmar/);
  const reserved=reduceAgnesState(seed,'reserve',{attemptId:randomUUID(),matchId:'gamma-delta',kind:'image',ordinal:0,promptHash:hash('p1'),model:'agnes-image-2.5-flash',expiresAtMs:now+3_600_000,guard:{manual:true,kickoffMs:now+86_400_000}},{nowMs:now}).state;
  assert.ok(reserved.slots['gamma-delta:image:0']);
  const {state,result}=reduceAgnesState(reserved,'release-legacy',{confirm:'release-legacy'},{nowMs:now});
  assert.deepEqual(state.cutover.legacyMatchIds,[]);
  assert.ok(state.slots['alpha-beta:image:0']);
  assert.ok(!state.slots['alpha-beta:video:0']);
  assert.ok(state.slots['gamma-delta:image:0']);
  assert.equal(result.released.length,1);
  assert.equal(state.activeVideoAttemptId,null);
});
test('set-quota requires confirmation and bounds the values',()=>{
  const seed=createAgnesState({nowMs:now});
  assert.throws(()=>reduceAgnesState(seed,'set-quota',{day:'2026-10-09',images:4,video_seconds:0},{nowMs:now}),/sin confirmar/);
  assert.throws(()=>reduceAgnesState(seed,'set-quota',{confirm:'set-quota',day:'mañana',images:4,video_seconds:0},{nowMs:now}),/día/);
  assert.throws(()=>reduceAgnesState(seed,'set-quota',{confirm:'set-quota',day:'2026-10-09',images:4001,video_seconds:0},{nowMs:now}),/imágenes/);
  const {state,result}=reduceAgnesState(seed,'set-quota',{confirm:'set-quota',day:'2026-10-09',images:4,video_seconds:0},{nowMs:now});
  assert.deepEqual(state.quota['2026-10-09'],{images:4,video_seconds:0});
  assert.equal(result.day,'2026-10-09');
});
test('shared CAS admits only one concurrent caller for the same slot',async()=>{
  const remote=backend(),clients=[0,1].map(()=>new AgnesStateClient({env,fetchImpl:remote.fetch.bind(remote)}));
  const outcomes=await Promise.all(clients.map(client=>client.transact('reserve',reserve())));
  assert.equal(outcomes.filter(o=>o.canPost).length,1);
  assert.equal(remote.state.quota['2026-10-09'].images,1);
});
test('lost reservation ACK remains consumed and never regrants to its owner',async()=>{
  const remote=backend(),client=new AgnesStateClient({env,fetchImpl:remote.fetch.bind(remote)}),input=reserve();
  remote.loseAck();await assert.rejects(client.transact('reserve',input),/incierto/);
  assert.equal((await client.transact('reserve',input)).canPost,false);
  assert.equal((await client.transact('reserve',reserve())).canPost,false);
  assert.equal(remote.puts,1);
});
test('bootstrap day quota is conservative and new UTC day admits capacity',()=>{
  const state=createAgnesState({nowMs:now});
  assert.equal(reduceAgnesState(state,'reserve',reserve(),{nowMs:now}).result.canPost,false);
  assert.equal(reduceAgnesState(state,'reserve',reserve({expiresAtMs:now+2*86_400_000,guard:{manual:true,kickoffMs:now+86_400_000}}),{nowMs:now+86_400_000}).result.canPost,true);
});
test('429 refund is idempotent and a new attempt is counted once on the original day',()=>{
  let {state,result}=reduceAgnesState(fresh(),'reserve',reserve(),{nowMs:now});
  const event={attemptId:result.attemptId,eventId:randomUUID(),type:'hard-rejected-429',httpStatus:429,provenRejected:true,retryAfterMs:1000};
  state=reduceAgnesState(state,'event',event,{nowMs:now}).state;
  state=reduceAgnesState(state,'event',event,{nowMs:now}).state;
  assert.equal(state.quota['2026-10-09'].images,0);
  assert.equal(reduceAgnesState(state,'reserve',reserve(),{nowMs:now}).result.canPost,false);
  state=reduceAgnesState(state,'reserve',reserve(),{nowMs:now+1001}).state;
  assert.equal(state.quota['2026-10-09'].images,1);
});
test('corrupt slots, missing cutover quota and truthy manual strings fail closed',()=>{
  let {state}=reduceAgnesState(fresh(),'reserve',reserve(),{nowMs:now});
  state.slots['alpha-beta:image:0'].state='rejected';
  assert.throws(()=>validateAgnesState(state),/corrupto/);
  state=fresh();delete state.quota['2026-10-08'];assert.throws(()=>validateAgnesState(state),/corte/);
  assert.equal(reduceAgnesState(fresh(),'reserve',reserve({guard:{manual:'false',kickoffMs:now}}),{nowMs:now}).result.canPost,false);
});
test('an uploaded resource fences cleanup until confirmation; cleanup closes future admission',()=>{
  let {state,result}=reduceAgnesState(fresh(),'reserve',reserve(),{nowMs:now});
  state=reduceAgnesState(state,'event',{attemptId:result.attemptId,eventId:randomUUID(),type:'completed'},{nowMs:now}).state;
  const upload={matchId:'alpha-beta',kind:'image',ordinal:0,claimId:randomUUID(),sha256:hash('bytes')};
  state=reduceAgnesState(state,'uploadclaim',upload,{nowMs:now}).state;
  assert.equal(reduceAgnesState(state,'cleanupclaim',{matchId:'alpha-beta',claimId:randomUUID(),pruneDue:true},{nowMs:now}).result.canDelete,false);
  state=reduceAgnesState(state,'uploadconfirm',upload,{nowMs:now}).state;
  state=reduceAgnesState(state,'cleanupclaim',{matchId:'alpha-beta',claimId:randomUUID(),pruneDue:true},{nowMs:now}).state;
  assert.equal(reduceAgnesState(state,'reserve',reserve({ordinal:1}),{nowMs:now}).result.canPost,false);
  assert.equal(reduceAgnesState(state,'uploadclaim',upload,{nowMs:now}).result.canPut,false);
});
test('private bucket and exact key are mandatory; 404 never auto-bootstraps',async()=>{
  let called=0;
  const fetchImpl=async()=>{called++;return new Response('',{status:404});};
  await assert.rejects(new AgnesStateClient({env:{...env,R2_STATE_KEY:'goatlab/other.json'},fetchImpl}).transact('health'),/configuración/);
  assert.equal(called,0);
  await assert.rejects(new AgnesStateClient({env,fetchImpl}).transact('health'),/404/);
  assert.equal(called,1);
});
test('compaction retains consumed slot and attempt tombstones without reopening admission',()=>{
  const input=reserve();let {state}=reduceAgnesState(fresh(),'reserve',input,{nowMs:now});
  const oldSize=JSON.stringify(state).length;
  state=reduceAgnesState(state,'compact',{}, {nowMs:now+9*86_400_000}).state;
  assert.equal(state.slots['alpha-beta:image:0'].state,'retired');
  assert.equal(state.attempts[input.attemptId].state,'retired');
  assert.ok(JSON.stringify(state).length<oldSize);
  assert.equal(reduceAgnesState(state,'reserve',reserve({expiresAtMs:now+20*86_400_000,guard:{manual:true,kickoffMs:now+19*86_400_000}}),{nowMs:now+9*86_400_000}).result.canPost,false);
  assert.equal(reduceAgnesState(state,'reserve',input,{nowMs:now+9*86_400_000}).result.canPost,false);
});
test('uncertain image holds the shared flight until a known terminal response',()=>{
  let {state,result}=reduceAgnesState(fresh(),'reserve',reserve(),{nowMs:now});
  assert.equal(reduceAgnesState(state,'reserve',reserve({matchId:'other-match'}),{nowMs:now}).result.canPost,false);
  state=reduceAgnesState(state,'event',{attemptId:result.attemptId,eventId:randomUUID(),type:'completed'},{nowMs:now}).state;
  assert.equal(reduceAgnesState(state,'reserve',reserve({matchId:'other-match'}),{nowMs:now}).result.canPost,true);
});
