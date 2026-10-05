import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createUiAccess, activityFrames } from '../fly/gateway/ui-access.mjs';

const origin='https://gateway.test';
const publicHeaders={ 'x-goatlab-client-ip':'203.0.113.20', origin };
async function fixture(t, additions={}) {
  const forwarded=[], resets=[], welcomes=[], saved=[];
  const upstreamSockets=new Set();
  const upstream=createServer((req,res)=>{forwarded.push(req.headers);res.end('native UI');});
  upstream.on('upgrade',(req,socket)=> {
    forwarded.push(req.headers); upstreamSockets.add(socket);socket.on('close',()=>upstreamSockets.delete(socket));socket.on('error',()=>{});
    const accept=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const access=createUiAccess({origin,owner:'1',controlSecret:'hook',upstream:`http://127.0.0.1:${upstream.address().port}`,
    reset:async chat=>resets.push(chat),sendWelcome:async (...args)=>welcomes.push(args),saveEvent:event=>saved.push(event),...additions });
  access.server.listen(0,'127.0.0.1'); access.control.listen(0,'127.0.0.1');
  await Promise.all([once(access.server,'listening'),once(access.control,'listening')]);
  t.after(()=>{access.close();for(const socket of upstreamSockets)socket.destroy();upstream.closeAllConnections();upstream.close();});
  const base=`http://127.0.0.1:${access.server.address().port}`;
  const control=(path,value,secret='hook')=>fetch(`http://127.0.0.1:${access.control.address().port}${path}`,{method:value?'POST':'GET',headers:{authorization:`Bearer ${secret}`},body:value?JSON.stringify(value):undefined});
  const get=(path='/',headers={})=>fetch(base+path,{redirect:'manual',headers:{...publicHeaders,...headers}});
  const login=code=>fetch(base+'/access',{method:'POST',redirect:'manual',headers:{...publicHeaders,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code})});
  return {access,base,control,get,login,welcomes,resets,forwarded,saved};
}
test('start rotates codes, cookies and live sockets; repeated Telegram updates do not reset or rotate',async t=>{
  let clock=1000;
  const f=await fixture(t,{now:()=>clock});
  assert.equal((await f.get()).status,303);
  assert.equal((await f.control('/start',{chat:'2',event:1})).status,503);
  assert.equal((await f.control('/start',{chat:'1',event:1},'wrong')).status,401);
  await f.control('/start',{chat:'1',event:1}); const code=f.welcomes[0][2];
  await f.control('/start',{chat:'1',event:1}); assert.equal(f.welcomes.length,1); assert.deepEqual(f.resets,['1']);
  const logged=await f.login(code);assert.equal(logged.status,303);
  const cookie=logged.headers.get('set-cookie').split(';')[0];
  assert.match(logged.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);
  assert.equal((await f.get('/',{cookie,authorization:'Bearer stolen','x-forwarded-user':'attacker','x-openclaw-scopes':'operator.admin'})).status,200);
  assert.equal(f.forwarded.at(-1)['x-forwarded-user'],'telegram:1');assert.equal(f.forwarded.at(-1).authorization,undefined);
  assert.doesNotMatch(f.forwarded.at(-1)['x-openclaw-scopes'],/admin/);
  clock+=1000;await f.get('/',{cookie});assert.equal(f.access.state().lastActivity,1000); // background GET does not keep it alive
  await f.control('/activity',{event:7});assert.equal(f.access.state().lastActivity,2000);
  clock+=1000;await f.control('/activity',{event:7});assert.equal(f.access.state().lastActivity,2000);
  const socket=await new Promise((resolve,reject)=> {
    const req=httpRequest(f.base,{headers:{...publicHeaders,cookie,upgrade:'websocket',connection:'Upgrade','sec-websocket-key':'dGhlIHNhbXBsZSBub25jZQ==','sec-websocket-version':'13'}});
    req.on('upgrade',(_,socket)=>resolve(socket));req.on('error',reject);req.end();
  });
  const closed=once(socket,'close'); socket.on('error',()=>{});
  await f.control('/start',{chat:'1',event:2}); await closed;
  assert.equal((await f.login(code)).status,401);assert.equal((await f.get('/',{cookie})).status,303);
  assert.equal(f.welcomes.length,2); assert.notEqual(f.welcomes[1][2],code); assert.deepEqual(f.saved,[1,2]);
  await f.control('/start',{chat:'1',event:1});assert.equal(f.welcomes.length,2);
  const newCookie=(await f.login(f.welcomes[1][2])).headers.get('set-cookie').split(';')[0];
  await f.control('/revoke',{});assert.equal((await f.get('/',{cookie:newCookie})).status,303);
  assert.equal((await f.login(f.welcomes[1][2])).status,401);
});
test('restart, origin checks, route escapes and failed welcome retries remain closed',async t=>{
  let fail=true; const codes=[];
  const f=await fixture(t,{lastEvent:8,sendWelcome:async(_,__,code)=>{codes.push(code);if(fail)throw Error('offline');}});
  await f.control('/start',{chat:'1',event:8});assert.equal(codes.length,0);
  assert.equal((await f.control('/start',{chat:'1',event:9})).status,503);
  fail=false; await f.control('/start',{chat:'1',event:9});assert.equal(codes[0],codes[1]);assert.equal(f.resets.length,1);
  assert.equal((await f.get('/access',{'x-goatlab-client-ip':'127.0.0.1'})).status,403);
  const logged=await f.login(codes[1]),cookie=logged.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.get('/',{cookie,origin:'https://attacker.test'})).status,403);
  assert.equal((await f.get('//attacker.test/leak',{cookie})).status,400);
  assert.equal(f.forwarded.length,0);
  await f.control('/start',{chat:'1',event:3});assert.equal(f.resets.length,2); // Telegram may randomize update ids after a week without events
});
test('only user RPC actions count as activity, including split and fragmented frames',()=>{
  const seen=[];const observe=activityFrames(()=>seen.push(true));
  const frame=(text,opcode=1,fin=true)=> {
    const data=Buffer.from(text),mask=Buffer.from([1,2,3,4]),header=Buffer.from([(fin?128:0)|opcode,128|data.length]);
    for(let i=0;i<data.length;i++)data[i]^=mask[i%4]; return Buffer.concat([header,mask,data]);
  };
  observe(frame('{}',9));observe(frame(JSON.stringify({type:'req',method:'sessions.list'})));
  assert.equal(seen.length,0);
  const send=JSON.stringify({type:'req',method:'chat.send'}),bytes=frame(send);
  observe(bytes.subarray(0,3));observe(bytes.subarray(3));assert.equal(seen.length,1);
  observe(frame(send.slice(0,10),1,false));observe(frame(send.slice(10),0));assert.equal(seen.length,2);
});
