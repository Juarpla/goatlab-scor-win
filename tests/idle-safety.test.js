import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNativeStop,resumeNativeStop,callNative} from '../fly/gateway/idle-safety.mjs';
test('native suspension keeps active work running and requires a zero-work admission freeze before stop',async()=>{
 assert.equal(await prepareNativeStop(async()=>({status:'busy',activeCount:1})),null);
 for(const result of [{status:'ready',activeCount:1,suspensionId:'x'},{status:'ready',activeCount:0},{status:'recovering'},{}])
  await assert.rejects(prepareNativeStop(async()=>result));
 const calls=[];const run=async(...args)=>{calls.push(args);return {status:'ready',activeCount:0,suspensionId:'lease'};};
 assert.equal(await prepareNativeStop(run),'lease');await resumeNativeStop('lease',run);
 assert.equal(calls[0][0],'gateway.suspend.prepare');assert.equal(calls[0][1].drain,undefined);
 assert.equal(calls[1][0],'gateway.suspend.resume');assert.deepEqual(calls[1][1],{suspensionId:'lease'});
});
test('idle RPC authenticates only to loopback and closes after success or rejection',async()=>{
 let sent=[],socket,fail=false;
 class FakeSocket extends EventTarget {
  constructor(url){super();assert.equal(url,'ws://127.0.0.1:3001');socket=this;queueMicrotask(()=>this.emit({event:'connect.challenge'}));}
  emit(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}));}
  send(text){const value=JSON.parse(text);sent.push(value);queueMicrotask(()=>this.emit({type:'res',id:value.id,ok:!fail,payload:value.id==='operation'?{status:'ready'}:{}}));}
  close(){this.closed=true;}
 }
 assert.deepEqual(await callNative('gateway.suspend.prepare',{}, {password:'local-only',WebSocketImpl:FakeSocket}),{status:'ready'});
 assert.equal(sent[0].params.client.mode,'backend');assert.equal(sent[0].params.auth.password,'local-only');assert(socket.closed);
 fail=true;sent=[];await assert.rejects(callNative('gateway.suspend.prepare',{}, {password:'local-only',WebSocketImpl:FakeSocket}),/authentication rejected/);
 assert.equal(sent.length,1);assert(socket.closed);
});
