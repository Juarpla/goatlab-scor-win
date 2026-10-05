/** Bounded, URL-addressed clips shared by Shorts; leases protect active jobs. */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, openSync, closeSync, writeSync, readdirSync, statSync, rmSync, renameSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const run=promisify(execFile), leases=new Map(), pending=new Map();
const key=url=>createHash('sha256').update(url).digest('hex');
export function pinClips(clips){for(const c of clips)leases.set(key(c.url),(leases.get(key(c.url))??0)+1);return()=>{for(const c of clips){const k=key(c.url),n=leases.get(k)-1;if(n)leases.set(k,n);else leases.delete(k);}};}
export function pruneClipCache(dir,{protectedUrls=[],purgeUnused=false,maxBytes=128_000_000}={}){
  if(!existsSync(dir))return 0;
  const protectedKeys=new Set([...protectedUrls.map(key),...leases.keys(),...pending.keys()]);
  const files=readdirSync(dir).map(name=>({name,path:join(dir,name),...statSync(join(dir,name))})).filter(f=>statSync(f.path).isFile());
  let size=files.reduce((s,f)=>s+f.size,0);
  for(const file of files.sort((a,b)=>a.mtimeMs-b.mtimeMs)){if(protectedKeys.has(file.name.slice(0,64)))continue;if(!purgeUnused&&size<=maxBytes)break;rmSync(file.path,{force:true});size-=file.size;}
  return size;
}
export async function cachedClip(clip,dir,{fetchImpl=fetch}={}){
  mkdirSync(dir,{recursive:true});const id=key(clip.url),file=join(dir,`${id}.mp4`),meta=join(dir,`${id}.json`);
  if(existsSync(file)&&existsSync(meta))return{path:file,...JSON.parse(readFileSync(meta,'utf8'))};
  if(pending.has(id))return pending.get(id);
  const work=(async()=>{
    const raw=`${file}.raw`,temp=`${file}.tmp.mp4`;
    try{
      const response=await fetchImpl(clip.url,{signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw new Error(`clip HTTP ${response.status}`);
      if(Number(response.headers.get('content-length'))>32_000_000)throw new Error('clip demasiado grande');
      let size=0;const fd=openSync(raw,'w');
      try{for await(const chunk of response.body){size+=chunk.length;if(size>32_000_000||pruneClipCache(dir)+chunk.length+size>128_000_000)throw new Error('caché de clips llena');writeSync(fd,chunk);}}finally{closeSync(fd);}
      await run('ffmpeg',['-y','-loglevel','error','-i',raw,'-map','0:v:0','-an','-c:v','copy','-movflags','+faststart',temp],{timeout:30000});
      const{stdout}=await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height:format=duration','-of','json',temp],{timeout:15000});
      const probe=JSON.parse(stdout),stream=probe.streams?.[0],duration=Number(probe.format?.duration);
      if(!(stream?.width>0&&stream?.height>0&&duration>0&&duration<=12.5))throw new Error('clip inválido');
      renameSync(temp,file);const info={width:stream.width,height:stream.height,duration};writeFileSync(meta,JSON.stringify(info));return{path:file,...info};
    }finally{rmSync(raw,{force:true});rmSync(temp,{force:true});}
  })();pending.set(id,work);try{return await work;}finally{pending.delete(id);}
}
export async function warmClips(clips,dir,log=()=>{}){const result=[];for(const clip of clips){try{result.push(await cachedClip(clip,dir));}catch(e){log(`clips: ${e.message}`);result.push(null);}}return result;}
