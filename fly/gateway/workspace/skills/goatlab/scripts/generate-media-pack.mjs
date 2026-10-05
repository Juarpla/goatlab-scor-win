/** Build one shared, bounded Agnes bank from the selected public prompt snapshot. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { selectMatches } from '../lib/youtube.js';
import { assetErrors } from '../lib/media.js';
import { normalizeAgnesImage } from '../lib/agnes.js';
import { editingFacts } from '../lib/match-facts.js';
import { validateContent } from '../lib/match-content.js';
import { mediaPublisher } from '../lib/media-progress.js';
const run = promisify(execFile);
const PIPELINE = fileURLToPath(new URL('./', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map(a => { const i=a.indexOf('='); return i<0 ? [a,true] : [a.slice(0,i),a.slice(i+1)]; }));
const repo = process.env.GOATLAB_REPO || '.';
const dir = args['--out'] || process.env.MEDIA_PACK_DIR || 'public/data/media-pack';
const base = (process.env.MEDIA_GEN_BASE || 'https://goatlab-gateway.fly.dev/media-gen').replace(/\/$/,'');
const fixtures = JSON.parse(await readFile(join(repo,'public/data/fixtures.json'),'utf8'));
let matches = selectMatches(fixtures.matches,{ onlyMatch:args['--match'], limit:args['--limit'] });
if (!matches.length && args['--match']) matches=(fixtures.matches ?? []).filter(m=>m.id===args['--match']||m.webId===args['--match']);
if (!matches.length) throw new Error('No hay un partido disponible para el banco');
await mkdir(dir,{recursive:true});
let snapshot={};
if(args['--content']) snapshot=JSON.parse(await readFile(args['--content'],'utf8'));
for(const match of matches){
  const matchId=match.webId ?? match.id, folder=join(dir,'gen',matchId);
  await mkdir(folder,{recursive:true});
  let prev, progress, scorers;
  try{prev=JSON.parse(await readFile(join(dir,`${matchId}.json`),'utf8'));}catch{}
  try{progress=JSON.parse(await readFile(join(dir,`${matchId}.progress.json`),'utf8'));}catch{}
  try{scorers=JSON.parse(await readFile(join(repo,'public/data/scorers.json'),'utf8'));}catch{}
  const startedAt=Number.isFinite(progress?.attemptStartedAt)?progress.attemptStartedAt:Date.now();
  const deadline=startedAt+15*60_000, expiresAt=(Date.parse(match.kickoff)+86400_000)/1000;
  const failures=[];
  const imagePack=snapshot['image-prompts'],videoPack=snapshot['video-prompts'],motionPack=snapshot['motion-prompts'];
  const imagePrompts=validateContent(imagePack,'image-prompts',matchId)?imagePack.prompts:[];
  const videoPrompts=validateContent(videoPack,'video-prompts',matchId)?videoPack.prompts:[];
  const motionPrompts=validateContent(motionPack,'motion-prompts',matchId)?motionPack.prompts:[];
  const facts=motionPrompts.length?motionPack.facts:editingFacts(match,scorers);
  if(!imagePrompts.length)failures.push('Image Prompts no disponibles');
  if(!videoPrompts.length)failures.push('Video Prompts no disponibles');
  if(!motionPrompts.length)failures.push('Motion Prompts no disponibles; montaje local disponible');
  const publish=mediaPublisher({dir,match,facts,attemptStartedAt:startedAt,target:10});
  const assets=[];
  for(const asset of prev?.assets ?? []){
    if(asset.source!=='agnes'||assetErrors(asset).length||assets.length>=10)continue;
    const file=new URL(asset.url).pathname.split('/').at(-1);
    if(!/^\d+\.(jpg|png|webp)$/.test(file))continue;
    const index=Number(file.split('.')[0]);
    if(imagePrompts.length && asset.query!==imagePrompts[index]?.prompt)continue;
    try{await readFile(join(folder,file));assets.push(asset);}catch{}
  }
  let clips=[];
  for(const clip of prev?.clips ?? []){try{if(/^clip-\d+\.mp4$/.test(clip.file)&&clip.source==='agnes'){await readFile(join(folder,clip.file));clips.push(clip);}}catch{}}
  const extras=()=>({clips,motionPrompts,failures,contentVersion:1});
  await publish(assets,'generating',extras());
  if(!process.env.AGNES_API_KEY?.trim())failures.push('falta AGNES_API_KEY');
  if(process.env.AGNES_API_KEY?.trim()){
    for(const [index,row]of imagePrompts.entries()){
      if(assets.some(a=>a.id===`${matchId}-${index}`))continue;
      const timeout=Number(process.env.AGNES_TIMEOUT_SECONDS||300);
      if(Date.now()+timeout*1000+35000>deadline){failures.push('Imágenes: presupuesto de preparación agotado');break;}
      const promptFile=join(folder,`${index}.prompt.txt`);await writeFile(promptFile,row.prompt);
      try{
        const {stdout}=await run(process.env.PYTHON_BIN||'python3',[join(PIPELINE,'agnes.py'),`--match=${matchId}`,`--index=${index}`,`--expires-at=${expiresAt}`,`--attempt-deadline=${deadline/1000}`,`--prompt-file=${promptFile}`,`--out=${folder}`],{env:process.env,timeout:Math.max(1,deadline-Date.now()),maxBuffer:1024*1024});
        const saved=JSON.parse(stdout);
        if(saved.prompt!==row.prompt)throw new Error('El slot existente pertenece a otra versión de prompts');
        const image={...normalizeAgnesImage({matchId,index,publicUrl:`${base}/${encodeURIComponent(matchId)}/${saved.file}`,model:saved.model,prompt:saved.prompt,at:saved.at}),width:saved.width,height:saved.height,prepared:true};
        if(assetErrors(image).length)throw new Error('imagen inválida');
        assets.push(image);await publish(assets,'generating',extras());
      }catch(error){const reason=String(error.stderr||error.message).trim().slice(0,180);failures.push(`Imagen ${index+1}: ${reason}`);if(/429|incierto|pausado/.test(reason))break;}
    }
    await publish(assets,'generating-clips',extras());
    if(videoPrompts.length&&assets.length&&clips.length<3&&Date.now()+1000<deadline){
      const input=join(folder,'video-input.json');await writeFile(input,JSON.stringify({matchId,prompts:videoPrompts,images:assets,deadline:deadline/1000,expiresAt}));
      try{
        const {stdout}=await run(process.env.PYTHON_BIN||'python3',[join(PIPELINE,'agnes_video.py'),`--input=${input}`,`--out=${folder}`],{env:process.env,timeout:Math.max(1,deadline-Date.now()+500),maxBuffer:1024*1024});
        const result=JSON.parse(stdout);failures.push(...result.failures);
        clips=[...new Map([...clips,...result.clips.map(c=>({...c,id:`${matchId}-clip-${c.index}`,source:'agnes',url:`${base}/${encodeURIComponent(matchId)}/${c.file}`}))].map(c=>[c.id,c])).values()].slice(0,3);
      }catch(error){failures.push(`Clips: ${String(error.stderr||error.message).slice(0,180)}`);}
    }
  }
  await publish(assets,'finished',extras());
  console.log(`media: ${matchId}: ${assets.length}/10 imágenes, ${clips.length}/3 clips; ${failures.join('; ')}`);
}
