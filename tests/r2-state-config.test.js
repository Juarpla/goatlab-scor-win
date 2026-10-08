import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStateConfig } from '../src/lib/r2-state-config.js';
import { AgnesStateClient } from '../fly/gateway/workspace/skills/goatlab/scripts/agnes-state.mjs';
const shared={R2_ACCOUNT_ID:'account',R2_ACCESS_KEY_ID:'access',R2_SECRET_ACCESS_KEY:'secret',R2_BUCKET:'public-media'};
test('same project credentials retain fixed private bucket and key',()=>{
 assert.deepEqual(resolveStateConfig(shared),{account:'account',access:'access',secret:'secret',bucket:'app-states',key:'goatlab/agnes-state.json'});
 assert.equal(resolveStateConfig({...shared,R2_ACCOUNT_ID:'',CLOUDFLARE_ACCOUNT_ID:'alternate'}).account,'alternate');
});
test('complete optional private credentials take precedence',()=>{
 const config=resolveStateConfig({...shared,R2_STATE_ACCESS_KEY_ID:'private-access',R2_STATE_SECRET_ACCESS_KEY:'private-secret'});
 assert.equal(config.access,'private-access');assert.equal(config.secret,'private-secret');
});
test('partial override never mixes credentials or makes a request',async()=>{
 let calls=0;const client=new AgnesStateClient({env:{...shared,R2_STATE_ACCESS_KEY_ID:'private-access'},fetchImpl:()=>{calls++;throw Error('network');}});
 await assert.rejects(client.readState(),/incompleta/);assert.equal(calls,0);
});
test('shared credential does not allow arbitrary state bucket or object',async()=>{
 for(const override of [{R2_STATE_BUCKET:'public-media'},{R2_STATE_KEY:'other/state.json'}]) {
  const client=new AgnesStateClient({env:{...shared,...override},fetchImpl:()=>{throw Error('network');}});
  await assert.rejects(client.readState(),/inválida/);
 }
});
