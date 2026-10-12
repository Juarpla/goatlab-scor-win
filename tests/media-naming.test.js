import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAgnesState, reduceAgnesState } from '../src/lib/agnes-state.js';
import { resolveCanonical } from '../src/lib/teams.js';
import { matchIn } from '../scripts/build-teams.mjs';
const now=Date.parse('2026-10-12T23:10:00Z');
const sha='a'.repeat(64);
const transition=(state,op,input)=>reduceAgnesState(state,op,input,{nowMs:now});
const completed=()=>createAgnesState({nowMs:now,legacySlots:[4,3].map(ordinal=>({matchId:'home-vs-away-2026-10-13',kind:'video',ordinal,promptHash:sha,referenceHash:sha,model:'agnes-video-2.5-flash',state:'completed',expiresAtMs:now+86400000}))});
test('provider names resolve to Lens and Sporting, never the Portugal national team',()=>{
  const catalog=JSON.parse(readFileSync('public/data/teams.json'));
  assert.equal(resolveCanonical(catalog,'Racing Club de Lens')?.web,'lens');
  assert.equal(resolveCanonical(catalog,'Sporting Clube de Portugal')?.web,'sporting-cp');
  assert.equal(resolveCanonical(catalog,'Portugal')?.web,'portugal');
  assert.equal(matchIn({name:'Portugal',league:'nations'},[{name:'Sporting Clube de Portugal',league:'champions',id:1}]),null);
});
test('fifth attempt gets first persistent publication position; positions are exclusive',()=>{
  let state=completed();const quota=structuredClone(state.quota);
  let change=transition(state,'publication-slot',{matchId:'home-vs-away-2026-10-13',kind:'video',ordinal:4});
  assert.equal(change.result.publicationIndex,1);state=change.state;
  assert.equal(transition(state,'publication-slot',{matchId:'home-vs-away-2026-10-13',kind:'video',ordinal:4}).result.publicationIndex,1);
  change=transition(state,'publication-slot',{matchId:'home-vs-away-2026-10-13',kind:'video',ordinal:3});
  assert.equal(change.result.publicationIndex,2);assert.deepEqual(change.state.quota,quota);
});

test('maintenance fences generation and migration preserves immutable admission identity',()=>{
  let state=completed();const before=structuredClone(state);
  state=transition(state,'maintenance-lock',{owner:'migration'}).state;
  assert.throws(()=>transition(state,'pollclaim',{matchId:'home-vs-away-2026-10-13',kind:'video',ordinal:4,owner:'runner'}),/mantenimiento/);
  assert.throws(()=>transition(state,'heartbeat',{runId:'runner',matchId:'home-vs-away-2026-10-13'}),/mantenimiento/);
  state=transition(state,'publication-slot',{owner:'migration',matchId:'home-vs-away-2026-10-13',kind:'video',ordinal:4}).state;
  const moved=transition(state,'migrate-match',{owner:'migration',from:'home-vs-away-2026-10-13',to:'lens-vs-sporting-cp-2026-10-13'}).state;
  const slot=moved.slots['lens-vs-sporting-cp-2026-10-13:video:4'];
  assert.equal(slot.generationMatchId,'home-vs-away-2026-10-13');assert.equal(slot.attemptId,before.slots['home-vs-away-2026-10-13:video:4'].attemptId);
  assert.equal(slot.referenceHash,sha);assert.deepEqual(moved.quota,before.quota);
  assert.equal(transition(moved,'migrate-match',{owner:'migration',from:'home-vs-away-2026-10-13',to:'lens-vs-sporting-cp-2026-10-13'}).changed,false);
});
test('parallel clients allocate different publication positions through CAS',async()=>{
  const {AgnesStateClient}=await import('../fly/gateway/workspace/skills/goatlab/scripts/agnes-state.mjs');
  let state=completed(),version=1;
  const fetchImpl=async(_url,request)=>{
    if(request.method==='GET')return Response.json(state,{headers:{etag:'"'+version+'"',date:new Date(now).toUTCString()}});
    await new Promise(resolve=>setImmediate(resolve));
    if(request.headers['if-match']!=='"'+version+'"')return new Response('',{status:412});
    state=JSON.parse(request.body);version++;return new Response('',{status:200});
  };
  const env={R2_STATE_ACCOUNT_ID:'account',R2_STATE_ACCESS_KEY_ID:'key',R2_STATE_SECRET_ACCESS_KEY:'secret'};
  const clients=[new AgnesStateClient({env,fetchImpl}),new AgnesStateClient({env,fetchImpl})];
  const positions=await Promise.all(clients.map((client,index)=>client.transact('publication-slot',{matchId:'home-vs-away-2026-10-13',kind:'video',ordinal:4-index})));
  assert.deepEqual(positions.map(row=>row.publicationIndex).sort(),[1,2]);
});

import {copyVerified,orderMoves,migrateMediaNames,cleanupMigration} from '../scripts/migrate-media-names.mjs';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function memoryStore() {
  const objects=new Map();let fail='';
  return {objects,setFail:value=>fail=value,
    listAll:async prefix=>[...objects].filter(([key])=>key.startsWith(prefix)).map(([key,row])=>({key,bytes:row.bytes.length})),
    exists:async key=>{if(fail==='HEAD')throw new Error('HEAD failed');const row=objects.get(key);return row?{key,bytes:row.bytes.length,meta:row.meta,etag:'"etag"'}:false;},
    get:async key=>{const row=objects.get(key);if(!row)throw new Error('GET missing');return row.bytes;},
    put:async(key,bytes,_type,meta)=>{if(fail==='PUT')throw new Error('PUT failed');objects.set(key,{bytes,meta});},
    del:async key=>objects.delete(key)
  };
}
test('migration copies are verified, never overwrite conflicts and preserve origin on PUT/HEAD failures',async()=>{
  const store=memoryStore(),bytes=Buffer.from('paid-clip'),source='partidos/a-b/clip-4.mp4',target='partidos/a-b/clip-1.mp4';
  const meta={sha256:digest(bytes),model:'agnes-video-2.5-flash',prompthash:sha,width:'720',height:'1280'};
  store.objects.set(source,{bytes,meta});const move={source,target,meta,sha256:meta.sha256,kind:'video'};
  for(const failure of ['PUT','HEAD']) {store.setFail(failure);await assert.rejects(copyVerified(move,{store}),new RegExp(failure));assert.ok(store.objects.has(source));}
  store.setFail('');store.objects.set(target,{bytes:Buffer.from('other'),meta:{...meta,sha256:digest('other')}});
  await assert.rejects(copyVerified(move,{store}),/ocupado/);assert.ok(store.objects.has(source));
  store.objects.delete(target);await copyVerified(move,{store});await copyVerified(move,{store});assert.ok(store.objects.has(source));
  assert.deepEqual(orderMoves([{source:'clip-0',target:'clip-1'},{source:'clip-1',target:'clip-2'}]).map(row=>row.source),['clip-1','clip-0']);
});
test('migration resumes after state relocation and removes old objects only after references publish',async t=>{
  const repo=await mkdtemp(join(tmpdir(),'goatlab-naming-'));t.after(()=>rm(repo,{recursive:true,force:true}));
  const dir=join(repo,'public/data');await mkdir(join(dir,'image-prompts'),{recursive:true});
  await writeFile(join(dir,'image-prompts/fd-575341.json'),JSON.stringify({matchId:'fd-575341',prompts:[{prompt:'Do not change this prompt fd-575341'}]}));
  await writeFile(join(dir,'fixtures.json'),JSON.stringify({matches:[{id:'fd-575341',home:'Racing Club de Lens',away:'Sporting Clube de Portugal'}]}));
  await writeFile(join(dir,'top.json'),JSON.stringify({ranking:[{id:'fd-575341'}]}));
  const store=memoryStore(),bytes=Buffer.from('paid-image'),hash=digest(bytes);
  let state=createAgnesState({nowMs:now,legacySlots:[{matchId:'fd-575341',kind:'image',ordinal:0,promptHash:sha,model:'agnes-image-2.5-flash',state:'completed',expiresAtMs:now+86400000}]});
  state.slots['fd-575341:image:0'].uploadClaim={id:'upload-1',sha256:hash,confirmed:true};
  store.objects.set('partidos/fd-575341/0.png',{bytes,meta:{sha256:hash,model:'agnes-image-2.5-flash',prompthash:sha,width:'720',height:'1280'}});
  const quota=structuredClone(state.quota),attemptId=state.slots['fd-575341:image:0'].attemptId;
  const client={readState:async()=>({state}),transact:async(op,input)=>{const change=transition(state,op,input);state=change.state;return change.result;}};
  let report=await migrateMediaNames({apply:true,repo,client,store});
  assert.ok(store.objects.has('partidos/fd-575341/0.png'));assert.ok(report.verified);
  report=await migrateMediaNames({apply:true,repo,client,store});assert.equal(report.cleanup.length,1);
  const prompt=JSON.parse(await readFile(join(dir,'image-prompts/lens-vs-sporting-cp-2026-10-13.json')));
  assert.equal(prompt.prompts[0].prompt,'Do not change this prompt fd-575341');
  assert.equal(state.slots['lens-vs-sporting-cp-2026-10-13:image:0'].attemptId,attemptId);assert.deepEqual(state.quota,quota);
  await cleanupMigration(report,{client,store});assert.ok(!store.objects.has('partidos/fd-575341/0.png'));
  await cleanupMigration(report,{client,store});assert.ok(store.objects.has('partidos/lens-vs-sporting-cp-2026-10-13/0.png'));
});
