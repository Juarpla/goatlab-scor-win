import test from 'node:test';
import assert from 'node:assert/strict';
import { safeMediaMessage, publicVideoDiagnostics, requestedMediaComplete } from '../src/lib/media-diagnostics.js';
import { reconcileVideoRecovery } from '../scripts/reconcile-video-recovery.mjs';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('public diagnostics redact credentials, IDs and signed URLs while preserving HTTP and cause',()=>{
  const value=safeMediaMessage('HTTP 503 {"token":"secret with spaces","video_id":"private-id"} Bearer abc https://example.test/x?sig=123 api-secret',{AGNES_API_KEY:'api-secret'});
  for(const secret of ['secret with spaces','private-id','abc','sig=123','api-secret']) assert.ok(!value.includes(secret));
  assert.ok(value.includes('HTTP 503'));
  assert.equal(publicVideoDiagnostics([{httpStatus:503,body:'provider unavailable',stage:'create'}])[0].message,'provider unavailable');
});
test('public diagnostics carry attempt and next action, marking missing history',()=>{
  const [legacy,next]=publicVideoDiagnostics([{httpStatus:503,body:'down',stage:'create'},{httpStatus:null,body:'timeout',stage:'create',attemptId:'attempt-1',next:'reintentar consulta'}]);
  assert.equal(legacy.attemptId,'detalle original no conservado');
  assert.equal(legacy.next,'detalle original no conservado');
  assert.equal(next.attemptId,'attempt-1');
  assert.equal(next.next,'reintentar consulta');
});
test('completion reflects exactly the requested mode',()=>{
  assert.equal(requestedMediaComplete({images:4,clips:0,mode:'images-only'}),true);
  assert.equal(requestedMediaComplete({images:1,clips:2,mode:'clips-only'}),true);
  assert.equal(requestedMediaComplete({images:4,clips:1,mode:'all'}),false);
});
test('accepted recovery is applied before unknown requests are archived',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'video-recovery-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await mkdir(join(dir,'a-b'));await writeFile(join(dir,'a-b','clip-0.accepted.json'),JSON.stringify({attemptId:'attempt-1',videoId:'known-id'}));
  const calls=[];
  await reconcileVideoRecovery({dir,env:{},log:()=>{},transactImpl:async(op,input)=>{
    calls.push({op,input});return op==='status'?{slot:{state:'uncertain',attemptId:'attempt-1',videoId:null}}:{abandoned:[]};
  }});
  assert.deepEqual(calls.map(c=>c.op),['status','event','recover-uncertain']);
  assert.equal(calls[1].input.videoId,'known-id');
});
