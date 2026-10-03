import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Coalesce metadata writes; acknowledge acceptance/delivery intent only after fsync in Gateway. */
export class RemoteLedger {
  constructor(url, secret, fetchImpl = fetch) {
    this.url=url; this.secret=secret; this.fetchImpl=fetchImpl;
    this.pending=new Map(); this.tail=Promise.resolve();
  }
  async request(method, body) {
    const response=await this.fetchImpl(this.url,{method,headers:{authorization:`Bearer ${this.secret}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30_000)});
    if(!response.ok) throw new Error(`registro temporal HTTP ${response.status}`);
    return response.json();
  }
  async restore(dir) {
    const records=await this.request('GET');
    if(!Array.isArray(records)) throw new Error('registro temporal inválido');
    mkdirSync(dir,{recursive:true});
    const ids=new Set(records.map(r=>r.id));
    for(const name of readdirSync(dir).filter(n=>/^job-[a-f0-9]+\.json$/.test(n))) {
      if(!ids.has(name.slice(0,-5))) rmSync(join(dir,name.slice(0,-5)),{recursive:true,force:true});
      rmSync(join(dir,name),{force:true});
    }
    for(const record of records) {
      if(!/^job-[a-f0-9]{32}$/.test(record.id)) throw new Error('identificador remoto inválido');
      writeFileSync(join(dir,`${record.id}.json`),JSON.stringify(record));
    }
  }
  save(job) { this.pending.set(job.id,JSON.parse(JSON.stringify(job))); }
  flush() {
    this.tail=this.tail.catch(()=>{}).then(async()=>{
      for(const [id,record] of this.pending) {
        if((record.retainUntil??record.expiresAt)<=Date.now()) { this.pending.delete(id); continue; }
        await this.request('PUT',record);
        if(this.pending.get(id)===record) this.pending.delete(id);
      }
    });
    return this.tail;
  }
}
