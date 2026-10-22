import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { JobStore } from '../fly/render/job-store.mjs';
import { digest } from '../fly/render/creative-job.mjs';

test('real HTTP worker protects artifacts and only sends the exact approved MP4, once', async t => {
  const state=mkdtempSync(join(tmpdir(),'goatlab-creative-api-'));
  t.after(()=>rmSync(state,{recursive:true,force:true}));
  const mock=join(state,'offline.mjs'),sent=join(state,'sent.txt'),caption=join(state,'caption.txt');
  writeFileSync(mock,`import {appendFileSync} from 'node:fs';globalThis.fetch=async(url,init)=>{if(!String(url).startsWith('https://api.telegram.org/botoffline/'))throw Error('external HTTP forbidden');if(String(url).endsWith('/sendVideo')){appendFileSync(${JSON.stringify(sent)},'video\\n');appendFileSync(${JSON.stringify(caption)},init.body.get('caption'));}return {ok:true,json:async()=>({ok:true,result:{message_id:42}})}};`);
  let store=new JobStore(state);
  const {job}=store.accept({workflowProtocol:3,requestId:'reviewed-audio',chatId:'1',matchId:'a-b',assets:[],audioFileId:'voice',expiresAt:Date.now()+3600_000});
  Object.assign(job,{visualStyle:'documentary',prepared:true,revision:1,status:'awaiting-review',operation:'render',planHash:'plan-1',duration:9,sizeMb:.1,
    candidate:{revision:1,videoHash:digest('approved-mp4'),frames:[{name:'review-1-0.jpg',time:1}]}});
  store.save(job);
  const dir=store.directory(job);
  writeFileSync(join(dir,'prepared.json'),JSON.stringify({source:{span:6,words:[],assets:[]},photos:[{src:'0.jpg'}],total:9}));
  writeFileSync(join(dir,'candidate-1.mp4'),'approved-mp4');
  writeFileSync(join(dir,'review-1-0.jpg'),'pixels');writeFileSync(join(dir,'0.jpg'),'source');
  const {job:tampered}=store.accept({workflowProtocol:3,requestId:'tampered-audio',chatId:'1',matchId:'a-b',assets:[],audioFileId:'voice',expiresAt:Date.now()+3600_000});
  for(const key of ['prepared','revision','status','operation','planHash','duration','sizeMb','candidate'])tampered[key]=structuredClone(job[key]);
  store.save(tampered);
  const otherDir=store.directory(tampered);
  writeFileSync(join(otherDir,'prepared.json'),readFileSync(join(dir,'prepared.json')));
  writeFileSync(join(otherDir,'candidate-1.mp4'),'changed-after-review');
  async function start(){
    const child=spawn(process.execPath,['--import',mock,resolve('fly/render/server.mjs')],{env:{...process.env,PORT:'0',RENDER_SECRET:'secret',TELEGRAM_BOT_TOKEN:'offline',RENDER_STATE_DIR:state,RENDER_LEDGER_URL:'',PHOTO_CACHE_DIR:join(state,'cache')},stdio:['ignore','pipe','pipe']});
    let out='',errors='';child.stderr.on('data',c=>errors+=c);
    const url=await new Promise((accept,reject)=>{
      const timer=setTimeout(()=>{child.kill();reject(Error(errors||'startup timeout'))},5000);
      child.stdout.on('data',c=>{out+=c;const port=out.match(/localhost:(\d+)/)?.[1];if(port){clearTimeout(timer);accept(`http://127.0.0.1:${port}`)}});
      child.once('exit',code=>{clearTimeout(timer);reject(Error(`startup ${code}: ${errors}`))});
    });
    return {url,async stop(){const ended=once(child,'exit');child.kill();await ended}};
  }
  const request=(app,path,body,auth=true)=>fetch(app.url+path,{method:body?'POST':'GET',headers:{...(auth?{authorization:'Bearer secret'}:{}),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  let app=await start();
  try{
    assert.equal((await (await request(app,'/healthz')).json()).maxSeconds,55);
    assert.equal((await request(app,`/jobs/${job.id}/artifacts/1/1/review-1-0.jpg`,undefined,false)).status,401);
    assert.equal((await request(app,`/jobs/${job.id}/artifacts/1/1/review-1-0.jpg`)).status,200);
    assert.equal((await request(app,`/jobs/${job.id}/artifacts/0/1/review-1-0.jpg`)).status,404);
    const decision={jobId:job.id,generation:1,revision:1,planHash:'plan-1',videoHash:job.candidate.videoHash,notes:'OpenClaw revisó los fotogramas',reviewedFrames:['review-1-0.jpg']};
    assert.equal((await request(app,'/render/approve',{...decision,reviewedFrames:[]})).status,400);
    assert.equal((await request(app,'/render/approve',{...decision,videoHash:'old-mp4'})).status,400);
    assert.equal(existsSync(sent),false);
    assert.equal((await request(app,'/render/approve',{...decision,jobId:tampered.id})).status,202);
    const tamperDeadline=Date.now()+5000;
    while((await (await request(app,`/jobs/${tampered.id}`)).json()).status!=='error'&&Date.now()<tamperDeadline)await new Promise(r=>setTimeout(r,20));
    assert.equal((await (await request(app,`/jobs/${tampered.id}`)).json()).status,'error');
    assert.equal(existsSync(sent),false,'changed files cannot be delivered even with matching approval metadata');
    assert.equal((await request(app,'/render/approve',decision)).status,202);
    const deadline=Date.now()+5000;
    while((await (await request(app,`/jobs/${job.id}`)).json()).status!=='done'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
    assert.equal((await (await request(app,`/jobs/${job.id}`)).json()).status,'done');
    assert.equal(readFileSync(sent,'utf8'),'video\n');
    assert.match(readFileSync(caption,'utf8'),/Dirección visual: Documental deportivo/);
    assert.equal((await (await request(app,`/jobs/${job.id}`)).json()).visualStyle,'documentary');
  }finally{await app.stop()}
  app=await start();
  try{
    assert.equal((await (await request(app,`/jobs/${job.id}`)).json()).status,'done');
    assert.equal(readFileSync(sent,'utf8'),'video\n');
    assert.match(readFileSync(caption,'utf8'),/Dirección visual: Documental deportivo/);
    assert.equal((await (await request(app,`/jobs/${job.id}`)).json()).visualStyle,'documentary');
  }finally{await app.stop()}
});
