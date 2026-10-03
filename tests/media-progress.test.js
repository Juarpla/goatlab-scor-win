import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mediaPublisher } from '../src/lib/media-progress.js';
import { editingFacts } from '../src/lib/match-facts.js';

test('eight valid photos publish an immutable snapshot while the producer continues to fifteen',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'goatlab-progress-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const match={webId:'a-b',home:'Alpha FC',away:'Beta FC'};
  const photos=Array.from({length:15},(_,i)=>({id:String(i),source:'pexels',url:`https://example.test/${i}.jpg`,page:`https://example.test/${i}`,photographer:'Photographer',license:'Pexels License',width:1472,height:2624,motive:'training'}));
  const publish=mediaPublisher({dir,match});
  assert.equal((await publish(photos.slice(0,7),'searching')).ready,false);
  assert.equal((await publish(photos.slice(0,8),'searching')).ready,true);
  const snapshot=JSON.parse(await readFile(join(dir,'a-b.json')));
  assert.equal(snapshot.assets.length,8);
  await publish(photos,'finished');
  assert.equal(JSON.parse(await readFile(join(dir,'a-b.json'))).assets.length,15);
  assert.equal(snapshot.assets.length,8);
  assert.deepEqual(JSON.parse(await readFile(join(dir,'a-b.progress.json'))).count,15);
});

test('chart facts copy available match data and never invent missing values',()=>{
  const facts=editingFacts({id:'a-b',home:'Alpha',away:'Beta',lastMatches:{home:[{home:'Alpha',away:'Gamma',homeScore:3,awayScore:1,date:'2026-10-01'}]}});
  assert.equal(facts.find(f=>f.id==='home.gf').value,3);
  assert.equal(facts.find(f=>f.id==='home.gf').unit,'goles');
  assert.ok(facts.every(f=>f.source));assert.ok(!facts.some(f=>f.id.startsWith('away.')));
});
