import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm,access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mediaPublisher } from '../src/lib/media-progress.js';
import { editingFacts } from '../src/lib/match-facts.js';
const photos=Array.from({length:15},(_,i)=>({id:String(i),source:'pexels',url:`https://example.test/${i}.jpg`,page:`https://example.test/${i}`,photographer:'Photographer',license:'Pexels License',width:1472,height:2624,motive:'training'}));
async function fixture(t) { const dir=await mkdtemp(join(tmpdir(),'goatlab-progress-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,match:{webId:'a-b',home:'Alpha FC',away:'Beta FC'}}; }
test('the bank is persisted incrementally but videos wait until its bounded attempt finishes',async t=>{
 const {dir,match}=await fixture(t), publish=mediaPublisher({dir,match});
 assert.equal((await publish(photos.slice(0,8),'searching')).ready,false);
 await assert.rejects(access(join(dir,'a-b.ready')));
 assert.equal(JSON.parse(await readFile(join(dir,'a-b.json'))).assets.length,8);
 assert.equal((await publish(photos,'finished')).ready,true);
 assert.equal(JSON.parse(await readFile(join(dir,'a-b.json'))).assets.length,15);
});
test('one rejected photo cannot abort thirteen usable photos or leave stale progress',async t=>{
 const {dir,match}=await fixture(t), publish=mediaPublisher({dir,match});
 const result=await publish([...photos.slice(0,13),{...photos[14],url:'https://example.test/broadcast_screenshot.jpg'}],'finished');
 assert.equal(result.count,13);assert.equal(result.ready,true);
 assert.equal(JSON.parse(await readFile(join(dir,'a-b.progress.json'))).phase,'finished');
});
test('an exhausted search with zero or one photo enables the graphics montage',async t=>{
 const {dir,match}=await fixture(t), publish=mediaPublisher({dir,match});
 for(const assets of [[],photos.slice(0,1)]) {
  assert.equal((await publish(assets,'finished')).ready,true);
  assert.equal(JSON.parse(await readFile(join(dir,'a-b.json'))).assets.length,assets.length);
 }
});
test('chart facts copy available match data and never invent missing values',()=>{
 const facts=editingFacts({id:'a-b',home:'Alpha',away:'Beta',lastMatches:{home:[{home:'Alpha',away:'Gamma',homeScore:3,awayScore:1,date:'2026-10-01'}]}});
 assert.equal(facts.find(f=>f.id==='home.gf').value,3);assert.equal(facts.find(f=>f.id==='home.gf').unit,'goles');
 assert.ok(facts.every(f=>f.source));assert.ok(!facts.some(f=>f.id.startsWith('away.')));
});
