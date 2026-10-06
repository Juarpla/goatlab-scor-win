import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeAgnesImage, AGNES_FREE_LIMITS } from '../src/lib/agnes.js';
const run=promisify(execFile);
test('a cached external bank is discarded without searches or image downloads',async t=>{
  const root=await mkdtemp(join(tmpdir(),'agnes-bank-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const data=join(root,'public/data'),out=join(root,'bank'); await mkdir(data,{recursive:true});await mkdir(join(out,'gen/a-b'),{recursive:true});
  const match={id:'a-b',webId:'a-b',home:'Alpha FC',away:'Beta FC',status:'NS',kickoff:new Date(Date.now()+3600_000).toISOString()};
  await writeFile(join(data,'fixtures.json'),JSON.stringify({matches:[match]}));
  const generated=normalizeAgnesImage({matchId:'a-b',index:0,publicUrl:'https://goatlab-gateway.fly.dev/media-gen/a-b/0.jpg'});
  await writeFile(join(out,'gen/a-b/0.jpg'),'existing generated file');
  await writeFile(join(out,'a-b.json'),JSON.stringify({matchId:'a-b',assets:[generated,...Array.from({length:14},(_,i)=>({source:'external',id:String(i),url:`https://photos.test/${i}.jpg`}))]}));
  const entry=resolve('fly/gateway/workspace/skills/goatlab/scripts/generate-media-pack.mjs');
  await run(process.execPath,['--input-type=module','-e',`globalThis.fetch=()=>{throw Error('external HTTP forbidden')};await import(${JSON.stringify('file://'+entry)});`,'--','--match=a-b'],{
    env:{...process.env,GOATLAB_REPO:root,MEDIA_PACK_DIR:out,AGNES_API_KEY:''},
  });
  const bank=JSON.parse(await readFile(join(out,'a-b.json')));
  assert.equal(bank.assets.length,1);assert.equal(bank.assets[0].source,'agnes');
  assert.equal(JSON.parse(await readFile(join(out,'a-b.progress.json'))).phase,'finished');
  assert.equal(AGNES_FREE_LIMITS.videoRpm,1);assert.equal(AGNES_FREE_LIMITS.dailyVideoSeconds,null);
});
