/** One-off, resumable naming migration. No Agnes calls, no quota resets. */
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {AgnesStateClient} from '../fly/gateway/workspace/skills/goatlab/scripts/agnes-state.mjs';
import * as r2 from './r2-media.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const FROM='fd-575341', TO='lens-vs-sporting-cp-2026-10-13';

export function orderMoves(moves) {
  const pending=[...moves],ordered=[];
  while(pending.length) {
    const index=pending.findIndex(move=>!pending.some(other=>other!==move&&other.source===move.target));
    if(index<0)throw new Error('ciclo de nombres; migración requiere intervención sin sobrescritura');
    ordered.push(...pending.splice(index,1));
  }
  return ordered;
}
function compatible(head,bytes,meta) {
  return !!head && head.bytes===bytes.length && sha(bytes)===meta.sha256 && Object.entries(meta).every(([key,value])=>head.meta[key]===String(value));
}
export async function copyVerified(move,{store=r2}={}) {
  const original=await store.exists(move.source);
  if(!original) {
    const target=await store.exists(move.target);
    if(!target || target.meta.sha256!==move.sha256)throw new Error('falta evidencia de origen: '+move.source);
    const bytes=await store.get(move.target);
    if(!compatible(target,bytes,move.meta))throw new Error('destino sin identidad compatible: '+move.target);
    return target;
  }
  const bytes=await store.get(move.source);
  if(sha(bytes)!==move.sha256 || original.bytes!==bytes.length || original.meta.sha256!==move.sha256)throw new Error('origen incompatible: '+move.source);
  const target=await store.exists(move.target);
  if(target && (target.meta.sha256!==move.sha256 || ['model','prompthash','width','height','duration'].some(key=>move.meta[key]!==undefined&&target.meta[key]!==String(move.meta[key]))))throw new Error('destino ocupado por otro recurso: '+move.target);
  if(!compatible(target,bytes,move.meta))await store.put(move.target,bytes,move.kind==='video'?'video/mp4':move.target.endsWith('.png')?'image/png':move.target.endsWith('.webp')?'image/webp':'image/jpeg',move.meta,target?{'if-match':target.etag}:{'if-none-match':'*'});
  const confirmed=await store.exists(move.target);
  if(!compatible(confirmed,bytes,move.meta) || sha(await store.get(move.target))!==move.sha256)throw new Error('verificación de destino fallida: '+move.target);
  return confirmed;
}

/** Only identity/path fields change; narration and generation prompts stay intact. */
export async function rewriteContent({repo='.',moves=[]}={}) {
  const rewrite=value=>{
    if(Array.isArray(value))return value.map(rewrite);
    if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key===FROM?TO:key,key==='providerId'||key==='prompt'||key==='inputKey'||key==='materialKey'?item:rewrite(item)]));
    if(typeof value!=='string')return value;
    if(value===FROM)return TO;
    let updated=value.replaceAll('/partido/'+FROM,'/partido/'+TO).replaceAll('/partidos/'+FROM+'/','/partidos/'+TO+'/');
    for(const move of moves)if(move.source!==move.target)updated=updated.replaceAll('/'+move.source,'/'+move.target);
    return updated;
  };
  const files=[];
  for(const category of ['image-prompts','video-prompts','motion-prompts','youtube-scripts','media-pack']) {
    for(const suffix of category==='media-pack'?['.json','.progress.json']:['.json']) {
      const source=join(repo,'public/data',category,FROM+suffix),target=join(repo,'public/data',category,TO+suffix);
      let data;try{data=JSON.parse(await readFile(source,'utf8'));}catch(error){if(error.code==='ENOENT')continue;throw error;}
      let existing;try{existing=JSON.parse(await readFile(target,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
      const updated=rewrite(data);
      if(existing&&JSON.stringify(existing)!==JSON.stringify(updated))throw new Error('contenido destino incompatible: '+target);
      await writeFile(target,JSON.stringify(updated,null,2)+'\n');await rm(source);files.push(target);
    }
  }
  const fixturesPath=join(repo,'public/data/fixtures.json');
  const fixtures=JSON.parse(await readFile(fixturesPath,'utf8'));
  const match=fixtures.matches.find(match=>match.id===FROM);
  if(match) {match.homeSlug='lens';match.awaySlug='sporting-cp';match.webId=TO;match.teamIds={...match.teamIds,web:{home:'lens',away:'sporting-cp'}};}
  await writeFile(fixturesPath,JSON.stringify(fixtures,null,2)+'\n');files.push(fixturesPath);
  const topPath=join(repo,'public/data/top.json');
  const top=JSON.parse(await readFile(topPath,'utf8'));await writeFile(topPath,JSON.stringify(rewrite(top),null,2)+'\n');files.push(topPath);
  for(const matchId of new Set(moves.filter(move=>move.kind==='video').map(move=>move.matchId))) {
    const path=join(repo,'public/data/media-pack',matchId+'.json');let bank;
    try{bank=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')continue;throw error;}
    for(const clip of bank.clips??[]) {
      const move=moves.find(move=>move.matchId===matchId&&move.sha256===clip.sha256);
      if(move){clip.file=move.target.split('/').at(-1);clip.id=matchId+'-clip-'+move.publicationIndex;clip.url=clip.url.slice(0,clip.url.indexOf('/partidos/'))+'/'+move.target;clip.referenceHash=move.meta.referencehash;}
    }
    bank.clips?.sort((a,b)=>a.file.localeCompare(b.file));await writeFile(path,JSON.stringify(bank,null,2)+'\n');files.push(path);
  }
  return files;
}

export async function migrateMediaNames({apply=false,repo='.',client=new AgnesStateClient(),store=r2,owner='media-naming-'+randomUUID()}={}) {
  let locked=false;
  const renew=async()=>client.transact('maintenance-lock',{owner});
  try {
    if(apply){await renew();locked=true;}
    const {state}=await client.readState();
    const objects=await store.listAll('partidos/');
    const moves=[];
    for(const row of Object.values(state.slots).filter(row=>row.state==='completed').sort((a,b)=>a.ordinal-b.ordinal)) {
      const matchId=row.matchId===FROM?TO:row.matchId;
      if(row.kind!=='video' && row.matchId!==FROM && row.generationMatchId!==FROM)continue;
      const prefix='partidos/'+(row.generationMatchId??row.matchId)+'/';
      let source=row.uploadClaim?.previousObjectKey??row.uploadClaim?.objectKey;
      if(!source)source=objects.find(object=>object.key===prefix+(row.kind==='video'?'clip-'+row.ordinal+'.mp4':row.ordinal+'.png')||row.kind==='image'&&new RegExp('^'+prefix+row.ordinal+'\\.(jpg|webp)$').test(object.key))?.key;
      if(!source) {if(row.kind==='video'&&!row.uploadClaim?.confirmed)continue;throw new Error('sin archivo de origen: '+row.matchId+':'+row.kind+':'+row.ordinal);}
      let head=await store.exists(source);
      let publicationIndex=row.publicationIndex;
      if(row.kind==='video'&&!publicationIndex)publicationIndex=apply?(await client.transact('publication-slot',{matchId:row.matchId,kind:row.kind,ordinal:row.ordinal,owner})).publicationIndex:1+moves.filter(move=>move.kind==='video'&&move.matchId===matchId).length;
      const target='partidos/'+matchId+'/'+(row.kind==='video'?'clip-'+publicationIndex+'.mp4':source.split('/').at(-1));
      if(!head)head=await store.exists(target);
      if(!head || head.meta.model!==row.model || head.meta.prompthash!==row.promptHash || head.meta.sha256!==row.uploadClaim?.sha256)throw new Error('identidad de origen ausente o incompatible: '+source);
      const meta={...head.meta,matchid:matchId,attemptid:row.attemptId,...(row.kind==='video'?{attemptordinal:String(row.ordinal),publicationindex:String(publicationIndex)}:{})};
      if(row.kind==='video'&&(row.generationMatchId===FROM||row.matchId===FROM)) {
        const base=(process.env.R2_PUBLIC_BASE??'').replace(/\/$/,'');
        for(let i=0;i<4;i++)for(const ext of ['png','jpg','webp'])if(meta.referencehash===sha(base+'/partidos/'+FROM+'/'+i+'.'+ext))meta.referencehash=sha(base+'/partidos/'+TO+'/'+i+'.'+ext);
      }
      moves.push({source,target,matchId,kind:row.kind,ordinal:row.ordinal,attemptId:row.attemptId,publicationIndex,sha256:head.meta.sha256,bytes:head.bytes,meta});
    }
    const report={apply,moves:moves.map(({source,target,ordinal,publicationIndex,bytes})=>({source,target,ordinal,publicationIndex,bytes}))};
    if(!apply)return report;
    for(const move of orderMoves(moves)){await renew();await copyVerified(move,{store});}
    await renew();
    if(Object.values(state.slots).some(row=>row.matchId===FROM))await client.transact('migrate-match',{owner,from:FROM,to:TO});
    for(const move of moves)await client.transact('relocate-publication',{owner,matchId:move.matchId,kind:move.kind,ordinal:move.ordinal,objectKey:move.target,sourceKey:move.source,sizeBytes:move.bytes,sha256:move.sha256,...(move.kind==='video'?{publicationIndex:move.publicationIndex,referenceHash:move.meta.referencehash}:{})});
    report.files=await rewriteContent({repo,moves});
    report.cleanup=moves.filter(move=>move.source!==move.target&&!moves.some(other=>other.target===move.source));
    report.verified=true;return report;
  } finally {if(locked)await client.transact('maintenance-unlock',{owner});}
}
export async function cleanupMigration(report,{client=new AgnesStateClient(),store=r2,owner='media-cleanup-'+randomUUID()}={}) {
  await client.transact('maintenance-lock',{owner});
  try {
    const {state}=await client.readState();
    for(const move of report.cleanup??[]) {
      const row=state.slots[move.matchId+':'+move.kind+':'+move.ordinal];
      if(!row?.uploadClaim?.confirmed || row.uploadClaim.objectKey!==move.target || row.uploadClaim.sha256!==move.sha256)throw new Error('estado destino sin confirmación; origen conservado');
      const head=await store.exists(move.target),bytes=await store.get(move.target);
      if(!compatible(head,bytes,move.meta))throw new Error('destino sin confirmar; origen conservado');
      const source=await store.exists(move.source);
      if(source && (source.meta.sha256!==move.sha256 || source.bytes!==bytes.length))throw new Error('origen cambió; no se elimina');
      if(source)await store.del(move.source);
      await client.transact('cleanup-publication',{owner,matchId:move.matchId,kind:move.kind,ordinal:move.ordinal,objectKey:move.target});
    }
    return {deleted:(report.cleanup??[]).map(move=>move.source)};
  } finally {await client.transact('maintenance-unlock',{owner});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try{const cleanup=process.argv.find(arg=>arg.startsWith('--cleanup='));
    console.log(JSON.stringify(cleanup?await cleanupMigration(JSON.parse(await readFile(cleanup.slice(10),'utf8'))):await migrateMediaNames({apply:process.argv.includes('--apply')}),null,2));}
  catch(error){console.error('migration: '+error.message);process.exitCode=2;}
}
