import { pathToFileURL } from 'node:url';
import { signR2 } from '../lib/r2-signed.js';
import { resolveStateConfig } from '../lib/r2-state-config.js';
import { AGNES_STATE_MAX_BYTES, validateAgnesState, reduceAgnesState } from '../lib/agnes-state.js';

export class AgnesStateClient {
  constructor({env=process.env,fetchImpl=fetch,timeoutMs=15_000}={}) {
    this.fetch=fetchImpl; this.timeoutMs=timeoutMs;
    this.operations={opsA:0,opsB:0};
    this.config=resolveStateConfig(env);
  }
  async request(method,body,condition) {
    const c=this.config;
    if (!c.account || !c.access || !c.secret || c.bucket!=='app-states' || c.key!=='goatlab/agnes-state.json') throw new Error('configuración privada R2 de Agnes incompleta o inválida');
    const bytes=body===undefined?Buffer.alloc(0):Buffer.from(JSON.stringify(body));
    if (bytes.length>AGNES_STATE_MAX_BYTES) throw new Error('autoridad Agnes supera presupuesto');
    const headers={...(method==='PUT'?{'content-type':'application/json','cache-control':'no-store'}:{'accept-encoding':'identity'}),...condition};
    const signed=signR2({...c,method,body:bytes,headers});
    if (method==='GET') this.operations.opsB++; else if (method==='PUT') this.operations.opsA++;
    return this.fetch(signed.url,{method,headers:signed.headers,body:method==='PUT'?bytes:undefined,signal:AbortSignal.timeout(this.timeoutMs)});
  }
  async readState() {
    const response=await this.request('GET');
    if (!response.ok) throw new Error(`autoridad Agnes GET HTTP ${response.status}`);
    const etag=response.headers.get('etag'),serverNowMs=Date.parse(response.headers.get('date'));
    if (!etag || !Number.isFinite(serverNowMs)) throw new Error('autoridad Agnes sin ETag o reloj fiable');
    if (Number(response.headers.get('content-length')||0)>AGNES_STATE_MAX_BYTES) throw new Error('autoridad Agnes supera presupuesto');
    const reader=response.body?.getReader();
    let bytes=0,chunks=[];
    if (reader) {
      for (;;) {const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>AGNES_STATE_MAX_BYTES){await reader.cancel();throw new Error('autoridad Agnes supera presupuesto');}chunks.push(value);}
    } else chunks=[Buffer.from(await response.text())];
    let state;try{state=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('autoridad Agnes JSON corrupto');}
    return {state:validateAgnesState(state),etag,serverNowMs};
  }
  async transact(operation,input={}) {
    if(operation==='bootstrap') {
      validateAgnesState(input.seed);
      let response;
      try {response=await this.request('PUT',input.seed,{'if-none-match':'*'});}catch{throw new Error('bootstrap Agnes incierto; no repetir sin revisar estado');}
      if(!response.ok)throw new Error(`bootstrap Agnes HTTP ${response.status}`);
      return {created:true};
    }
    for(let retry=0;retry<3;retry++) {
      const snapshot=await this.readState();
      const transition=reduceAgnesState(snapshot.state,operation,input,{nowMs:snapshot.serverNowMs});
      if(!transition.changed)return transition.result;
      let response;
      try {response=await this.request('PUT',transition.state,{'if-match':snapshot.etag});}catch{throw new Error('autoridad Agnes PUT incierto; permiso POST no concedido');}
      if(response.status===412)continue;
      if(!response.ok)throw new Error(`autoridad Agnes PUT HTTP ${response.status}; permiso POST no concedido`);
      return transition.result;
    }
    throw new Error('autoridad Agnes conflicto CAS repetido; no se concede permiso');
  }
}

export const readState = options => new AgnesStateClient(options).readState();
export const transact = async (operation,input,options) => {
  const client = new AgnesStateClient(options);
  try { return { ...await client.transact(operation,input), operations:{control:client.operations} }; }
  catch (error) { error.operations={control:client.operations}; throw error; }
};
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    let input='',bytes=0;
    for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>1_000_000)throw new Error('entrada Agnes demasiado grande');input+=chunk.toString('utf8');}
    const result=await transact(process.argv[2],input.trim()?JSON.parse(input):{});
    process.stdout.write(JSON.stringify({ok:true,...result})+'\n');
  }catch(error){process.stdout.write(JSON.stringify({ok:false,operations:error.operations,reason:error instanceof SyntaxError?'entrada Agnes inválida':String(error.message).replace(/https?:\/\/\S+/g,'[endpoint]')})+'\n');process.exitCode=1;}
}
