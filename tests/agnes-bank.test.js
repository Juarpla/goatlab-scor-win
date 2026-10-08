import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { normalizeAgnesImage, AGNES_FREE_LIMITS, AGNES_TOKEN_LIMITS } from '../src/lib/agnes.js';
import { buildYoutubeScripts } from '../src/lib/youtube.js';
const run=promisify(execFile);
async function runBank(root,out,extraArgs=[],env={}){
  // Sin AGNES_API_KEY no hay HTTP: el script falla antes de llamar a Agnes.
  const entry=resolve('fly/gateway/workspace/skills/goatlab/scripts/generate-media-pack.mjs');
  await run(process.execPath,[entry,...extraArgs],{
    env:{...process.env,GOATLAB_REPO:root,MEDIA_PACK_DIR:out,AGNES_API_KEY:'',...env},
  });
}
const IMAGE_KINDS=['ball-duel','goal-action','supporters','stadium'];
function imagePromptsDoc(matchId){
  return {version:1,category:'image-prompts',matchId,home:'Alpha',away:'Beta',prompts:IMAGE_KINDS.map((kind,i)=>{
    const tail=kind==='stadium'?'Stadium, flags and team crests.':kind==='supporters'?'Both groups of supporters, fans and crowd.':'';
    return {n:i+1,kind,title:kind,prompt:`Referential photorealistic illustration of Alpha and Beta football teams interacting in realistic uniforms, vertical 9:16. ${kind} ${'Natural lighting, realistic anatomy and team colours, context only. '.repeat(4)}${tail}`};
  })};
}
function videoPromptsDoc(matchId){
  const kinds=['push-in','tracking'];
  return {version:1,category:'video-prompts',matchId,home:'Alpha',away:'Beta',prompts:kinds.map((kind,i)=>({n:i+1,kind,title:kind,prompt:`Animate this input image with a smooth ${kind} camera move, 6 seconds, vertical 9:16, hyperrealistic motion. ${'Stable anatomy and coherent sports movement. '.repeat(6)}`}))};
}
async function shortsRepo(root,ids){
  const data=join(root,'public/data');
  await mkdir(data,{recursive:true});
  const kickoff=new Date(Date.now()+3600_000).toISOString();
  await writeFile(join(data,'fixtures.json'),JSON.stringify({matches:ids.map(id=>({id,webId:id,home:'Alpha',away:'Beta',competition:'league',status:'NS',kickoff}))}));
  await writeFile(join(data,'top.json'),JSON.stringify({version:1,generatedAt:new Date().toISOString(),n:5,ranking:ids.map(id=>({id})),extra:[]}));
  for(const dir of ['youtube-scripts','image-prompts','video-prompts'])await mkdir(join(data,dir),{recursive:true});
  return data;
}
async function withPrompts(data,matchId){
  const fixture=JSON.parse(await readFile(join(data,'fixtures.json'))).matches.find(m=>m.id===matchId);
  await writeFile(join(data,'youtube-scripts',`${matchId}.json`),JSON.stringify({...buildYoutubeScripts(fixture),...fixture,matchId}));
  await writeFile(join(data,'image-prompts',`${matchId}.json`),JSON.stringify({...imagePromptsDoc(matchId),competition:fixture.competition,kickoff:fixture.kickoff}));
  await writeFile(join(data,'video-prompts',`${matchId}.json`),JSON.stringify({...videoPromptsDoc(matchId),competition:fixture.competition,kickoff:fixture.kickoff}));
}
test('a cached external bank is discarded without searches or image downloads',async t=>{
  const root=await mkdtemp(join(tmpdir(),'agnes-bank-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const data=join(root,'public/data'),out=join(root,'bank'); await mkdir(data,{recursive:true});await mkdir(join(out,'gen/a-b'),{recursive:true});
  const match={id:'a-b',webId:'a-b',home:'Alpha FC',away:'Beta FC',status:'NS',kickoff:new Date(Date.now()+3600_000).toISOString()};
  await writeFile(join(data,'fixtures.json'),JSON.stringify({matches:[match]}));
  const generated=normalizeAgnesImage({matchId:'a-b',index:0,publicUrl:'https://goatlab-gateway.fly.dev/media-gen/a-b/0.jpg'});
  await writeFile(join(out,'gen/a-b/0.jpg'),'existing generated file');
  await writeFile(join(out,'a-b.json'),JSON.stringify({matchId:'a-b',assets:[generated,...Array.from({length:14},(_,i)=>({source:'external',id:String(i),url:`https://photos.test/${i}.jpg`}))]}));
  await writeFile(join(data,'top.json'),JSON.stringify({version:1,generatedAt:new Date().toISOString(),ranking:[{id:'a-b'}],extra:[]}));
  await runBank(root,out,['--match=a-b']);
  const bank=JSON.parse(await readFile(join(out,'a-b.json')));
  assert.equal(bank.assets.length,1);assert.equal(bank.assets[0].source,'agnes');
  assert.equal(JSON.parse(await readFile(join(out,'a-b.progress.json'))).phase,'finished');
  assert.equal(AGNES_FREE_LIMITS.videoRpm,1);assert.equal(AGNES_FREE_LIMITS.dailyVideoSeconds,null);
  assert.equal(AGNES_TOKEN_LIMITS.plan,'starter');assert.equal(AGNES_TOKEN_LIMITS.dailyVideoSeconds,500);
  assert.equal(AGNES_TOKEN_LIMITS.operative.videoStartSeconds,30);assert.equal(AGNES_TOKEN_LIMITS.operative.dailyVideoSeconds,360);
});
test('batch reads prompts from the repo top set and skips matches without scripts',async t=>{
  const root=await mkdtemp(join(tmpdir(),'agnes-gate-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const out=join(root,'bank');
  const data=await shortsRepo(root,['a-b','c-d']);
  await withPrompts(data,'a-b');
  await runBank(root,out);
  const progress=JSON.parse(await readFile(join(out,'a-b.progress.json')));
  assert.equal(progress.phase,'finished');
  assert.ok(progress.failures.some(f=>f.includes('falta AGNES_API_KEY')));
  assert.ok(!progress.failures.some(f=>f.includes('Image Prompts no disponibles')));
  assert.ok(!progress.failures.some(f=>f.includes('Video Prompts no disponibles')));
  await assert.rejects(access(join(out,'c-d.json')));
  await assert.rejects(access(join(out,'gen','c-d')));
});
test('an explicit snapshot wins over repo prompts for the same category',async t=>{
  const root=await mkdtemp(join(tmpdir(),'agnes-snap-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const out=join(root,'bank');
  const data=await shortsRepo(root,['a-b']);
  await withPrompts(data,'a-b');
  const foreign={version:1,category:'image-prompts',matchId:'zzz',home:'A',away:'B',prompts:imagePromptsDoc('zzz').prompts};
  const snapshot=join(root,'snapshot.json');
  await writeFile(snapshot,JSON.stringify({'image-prompts':foreign}));
  await runBank(root,out,['--match=a-b',`--content=${snapshot}`]);
  const progress=JSON.parse(await readFile(join(out,'a-b.progress.json')));
  assert.ok(progress.failures.some(f=>f.includes('Image Prompts no disponibles')));
  assert.ok(!progress.failures.some(f=>f.includes('Video Prompts no disponibles')));
});
test('a cached bank is capped at four photos and two clips',async t=>{
  const root=await mkdtemp(join(tmpdir(),'agnes-cap-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const out=join(root,'bank');
  const data=await shortsRepo(root,['a-b']);
  await withPrompts(data,'a-b');
  const prompts=imagePromptsDoc('a-b').prompts;
  const assets=Array.from({length:6},(_,i)=>({...normalizeAgnesImage({matchId:'a-b',index:i,publicUrl:`https://goatlab-gateway.fly.dev/media-gen/a-b/${i}.jpg`,prompt:i<4?prompts[i].prompt:'old unmatched prompt'})}));
  await mkdir(out,{recursive:true});
  const hash = value => createHash('sha256').update(value).digest('hex');
  await writeFile(join(out,'a-b.json'),JSON.stringify({matchId:'a-b',assets,clips:[0,1,2].map(i=>({id:`a-b-clip-${i}`,file:`clip-${i}.mp4`,source:'agnes',model:'agnes-video-2.5-flash',width:720,height:1280,duration:6,promptHash:hash(videoPromptsDoc('a-b').prompts[i%2].prompt),referenceHash:hash(assets[i].url)}))}));
  await mkdir(join(out,'gen','a-b'),{recursive:true});
  for(let i=0;i<6;i++)await writeFile(join(out,'gen','a-b',`${i}.jpg`),'cached');
  for(let i=0;i<3;i++)await writeFile(join(out,'gen','a-b',`clip-${i}.mp4`),'cached');
  await runBank(root,out);
  const bank=JSON.parse(await readFile(join(out,'a-b.json')));
  assert.equal(bank.assets.length,4);
  assert.deepEqual(bank.assets.map(a=>a.id),['a-b-0','a-b-1','a-b-2','a-b-3']);
  assert.equal(bank.clips.length,2);
});
test('--match registers the id as a manual extra',async t=>{
  const root=await mkdtemp(join(tmpdir(),'agnes-extra-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const out=join(root,'bank');
  const data=await shortsRepo(root,['a-b','c-d']);
  await withPrompts(data,'a-b');
  await runBank(root,out,['--match=c-d']);
  const top=JSON.parse(await readFile(join(data,'top.json')));
  assert.ok(top.extra.includes('c-d'));
  assert.ok(JSON.parse(await readFile(join(out,'c-d.json'))));
});
