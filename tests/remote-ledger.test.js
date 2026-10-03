import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobStore } from '../fly/render/job-store.mjs';
import { RemoteLedger } from '../fly/render/remote-ledger.mjs';

test('remote records recover after losing Render disk and an interrupted delivery never resends', async t => {
  const remote=new Map(); let failure=false;
  const fetchImpl=async(_url,request)=>{
    assert.equal(request.headers.authorization,'Bearer secret');
    if(failure) return new Response('{}',{status:503});
    if(request.method==='GET') return Response.json([...remote.values()]);
    const record=JSON.parse(request.body); remote.set(record.id,record); return Response.json({ok:true});
  };
  const dir=mkdtempSync(join(tmpdir(),'goatlab-remote-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let ledger=new RemoteLedger('https://example.test/render-ledger','secret',fetchImpl);
  let store=new JobStore(dir,{ledger});
  const body={requestId:'stable',chatId:'1',matchId:'a-b',audioFileId:'voice',expiresAt:Date.now()+3600_000};
  const {job}=store.accept(body); await store.flush();
  job.status='delivering'; store.save(job);
  failure=true; await assert.rejects(store.flush(),/503/);
  failure=false; await store.flush();
  rmSync(dir,{recursive:true,force:true});
  ledger=new RemoteLedger('https://example.test/render-ledger','secret',fetchImpl);
  await ledger.restore(dir); store=new JobStore(dir,{ledger});
  assert.equal(store.pending().length,0);
  assert.equal(store.accept(body).job.status,'delivery-unknown');
  assert.equal(store.accept(body).duplicate,true);
  store.jobs.get(job.id).status='done'; store.release(store.jobs.get(job.id)); await store.flush();
  assert.equal(remote.get(job.id).audioFileId,undefined);
});
