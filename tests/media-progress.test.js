import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm,access,writeFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mediaPublisher } from '../src/lib/media-progress.js';
import { normalizeAgnesImage } from '../src/lib/agnes.js';
import { editingFacts } from '../src/lib/match-facts.js';
const photos=Array.from({length:4},(_,i)=>normalizeAgnesImage({matchId:'a-b',index:i,publicUrl:`https://example.test/${i}.jpg`}));
async function fixture(t) { const dir=await mkdtemp(join(tmpdir(),'goatlab-progress-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,match:{webId:'a-b',home:'Alpha FC',away:'Beta FC'}}; }
test('the bank is persisted incrementally and becomes ready when its attempt finishes',async t=>{
 const {dir,match}=await fixture(t), publish=mediaPublisher({dir,match});
 assert.equal((await publish(photos.slice(0,2),'generating')).ready,false);
 await assert.rejects(access(join(dir,'a-b.ready')));
 assert.equal(JSON.parse(await readFile(join(dir,'a-b.json'))).assets.length,2);
 assert.equal((await publish(photos,'finished')).ready,true);
 assert.equal(JSON.parse(await readFile(join(dir,'a-b.json'))).assets.length,4);
});
const verifiedAt='2026-10-08T22:00:00.000Z';
const hash=value=>createHash('sha256').update(value).digest('hex');
const verifiedPhotos=photos.map((photo,index)=>({...photo,sha256:hash(`photo ${index}`)}));
function verifiedExtra(){return{bankVersion:2,contentFingerprint:hash('content inputs'),storageVerifiedAt:verifiedAt,verifiedAssets:verifiedPhotos.map(photo=>photo.id),clips:[0,1].map(index=>({id:`a-b-clip-${index}`,source:'agnes',url:`https://example.test/clip-${index}.mp4`,model:'agnes-video-2.5-flash',width:720,height:1280,duration:6,sha256:hash(`clip ${index}`),promptHash:hash(`prompt ${index}`),referenceHash:hash(verifiedPhotos[index].url)})),verifiedClips:['a-b-clip-0','a-b-clip-1']};}

test('completion requires current storage proofs and strips private verification inputs',async t=>{
 const {dir,match}=await fixture(t), publish=mediaPublisher({dir,match,clock:()=>verifiedAt});
 const missing=verifiedExtra();delete missing.verifiedClips;
 assert.equal((await publish(verifiedPhotos,'finished',missing)).complete,false);
 const result=await publish(verifiedPhotos,'finished',verifiedExtra());
 assert.equal(result.complete,true);assert.equal(result.publishable,true);
 const manifest=JSON.parse(await readFile(join(dir,'a-b.json')));
 assert.equal(manifest.bankStatus,'complete');
 assert.equal('verifiedAssets' in manifest,false);assert.equal('verifiedClips' in manifest,false);
 const progress=JSON.parse(await readFile(join(dir,'a-b.progress.json')));
 assert.equal('attemptStartedAt' in progress,false);assert.equal(progress.complete,true);
 const subsequent=await publish(verifiedPhotos,'finished',{...verifiedExtra(),verifiedAssets:[]});
 assert.equal(subsequent.complete,false);assert.equal(subsequent.publishable,false);
});

test('hourly partial draft publishes only progress; a proven bank becomes publishable',async t=>{
 const {dir,match}=await fixture(t), publish=mediaPublisher({dir,match,draft:true,clock:()=>verifiedAt});
 const result=await publish(verifiedPhotos.slice(0,2),'finished',verifiedExtra());
 assert.equal(result.publishable,false);assert.equal(result.ready,false);
 assert.deepEqual(await readdir(dir),['a-b.progress.json']);
 const completed=await publish(verifiedPhotos,'finished',verifiedExtra());
 assert.equal(completed.complete,true);assert.equal(completed.publishable,true);assert.equal(completed.ready,true);
 assert.deepEqual((await readdir(dir)).sort(),['a-b.json','a-b.progress.json','a-b.ready']);
});

test('partial retries preserve an existing complete manifest and ready snapshot byte-for-byte',async t=>{
 const {dir,match}=await fixture(t);
 const initial=mediaPublisher({dir,match,clock:()=>verifiedAt});
 await initial(verifiedPhotos,'finished',verifiedExtra());
 const original=await readFile(join(dir,'a-b.json'),'utf8'),ready=await readFile(join(dir,'a-b.ready'),'utf8');
 for(const draft of [false,true]){
  const retry=mediaPublisher({dir,match,draft,clock:()=>verifiedAt});
  const result=await retry(verifiedPhotos.slice(0,1),'finished',{...verifiedExtra(),clips:[]});
  assert.equal(result.complete,false);assert.equal(result.publishable,false);assert.equal(result.ready,true);
  assert.equal(await readFile(join(dir,'a-b.json'),'utf8'),original);
  assert.equal(await readFile(join(dir,'a-b.ready'),'utf8'),ready);
 }
});

test('legacy counts are playable partials without becoming modern complete banks',async t=>{
 const {dir,match}=await fixture(t), publish=mediaPublisher({dir,match,clock:()=>verifiedAt});
 const result=await publish(photos,'finished',{attemptStartedAt:1});
 assert.equal(result.complete,false);assert.equal(result.ready,true);
 const manifest=JSON.parse(await readFile(join(dir,'a-b.json'))),progress=JSON.parse(await readFile(join(dir,'a-b.progress.json')));
 assert.equal(manifest.bankStatus,'partial');assert.equal('attemptStartedAt' in manifest,false);assert.equal('attemptStartedAt' in progress,false);
 await writeFile(join(dir,'a-b.json'),JSON.stringify({...manifest,bankStatus:'complete'}));
 const retry=mediaPublisher({dir,match,clock:()=>verifiedAt});
 assert.equal((await retry(photos.slice(0,1),'finished')).complete,false);
 assert.equal(JSON.parse(await readFile(join(dir,'a-b.json'))).bankStatus,'complete');
});
test('one rejected photo cannot abort three usable images or leave stale progress',async t=>{
 const {dir,match}=await fixture(t), publish=mediaPublisher({dir,match});
 const result=await publish([...photos.slice(0,3),{...photos[3],source:'external'}],'finished');
 assert.equal(result.count,3);assert.equal(result.ready,true);
 assert.equal(JSON.parse(await readFile(join(dir,'a-b.progress.json'))).phase,'finished');
});
test('an exhausted generation with zero or one photo enables the graphics montage',async t=>{
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
