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

test('parallel clients allocate different publication positions through CAS',async()=>{
  const {AgnesStateClient}=await import('../scripts/agnes-state.mjs');
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
