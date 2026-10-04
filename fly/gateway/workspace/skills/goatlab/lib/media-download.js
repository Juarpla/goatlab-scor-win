import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rename, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
const run = promisify(execFile);
async function bytes(dir) {
  let total=0;
  for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[])) {
    const path=join(dir,entry.name);
    total+=entry.isDirectory()?await bytes(path):(await stat(path)).size;
  }
  return total;
}
/** Download and decode before publishing. Normalized files share the bounded media cache. */
export async function prepareImage(asset,{dir,matchId,base,deadline,fetcher=fetch,runner=run}) {
  const folder=join(dir,'gen',matchId);await mkdir(folder,{recursive:true});
  // A previously prepared file is reused without a second download or allocation.
  if(asset.prepared || asset.source==='agnes') {
    const file=new URL(asset.url).pathname.split('/').at(-1);
    if(/^[a-zA-Z0-9_.-]+$/.test(file) && asset.width>0 && asset.height>0) {
      try{await stat(join(folder,file));return asset;}catch{}
    }
  }
  const originalUrl=asset.originalUrl || asset.url;
  const name='search-'+createHash('sha256').update(originalUrl).digest('hex').slice(0,24)+'.jpg';
  const path=join(folder,name), raw=path+'.download',temp=path+'.tmp.jpg';
  const remaining=()=>Math.min(20000,deadline-Date.now());
  if(remaining()<1000) return null;
  try {
    let cached=true;try {await stat(path);}catch{cached=false;}
    if(!cached) {
      const response=await fetcher(originalUrl,{headers:{'user-agent':'GoatLab/2.0 (https://goatlab.win)'},signal:AbortSignal.timeout(remaining())});
      if(!response.ok || !/^image\//.test(response.headers.get('content-type')||''))return null;
      const chunks=[];let size=0;
      for await(const chunk of response.body) {
        size+=chunk.length;if(size>16_000_000)throw new Error('imagen demasiado grande');chunks.push(chunk);
      }
      if(await bytes(join(dir,'gen'))+size+2_000_000>128_000_000)throw new Error('caché llena');
      await writeFile(raw,Buffer.concat(chunks));
      await runner('ffmpeg',['-y','-loglevel','error','-i',raw,'-frames:v','1','-vf',"scale='min(2048,iw)':-2",'-q:v','3',temp],{timeout:Math.max(1,remaining())});
      await rename(temp,path);
    }
    const {stdout}=await runner('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',path],{timeout:Math.max(1,remaining())});
    const dimensions=JSON.parse(stdout).streams[0];
    if(!dimensions?.width || !dimensions?.height || Math.max(dimensions.width,dimensions.height)<720) {await rm(path,{force:true});return null;}
    return {...asset,originalUrl,url:`${base}/${encodeURIComponent(matchId)}/${name}`,width:dimensions.width,height:dimensions.height,prepared:true};
  }catch{return null;}finally{await rm(raw,{force:true});await rm(temp,{force:true});}
}
