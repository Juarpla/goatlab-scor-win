/** Build one shared, bounded Agnes bank from the selected public prompt snapshot. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { selectMatches } from '../lib/youtube.js';
import { assetErrors } from '../lib/media.js';
import { normalizeAgnesImage } from '../lib/agnes.js';
import { editingFacts } from '../lib/match-facts.js';
import { validateContent } from '../lib/match-content.js';
import { mediaPublisher } from '../lib/media-progress.js';
import { TOP_FILENAME, TOP_VERSION, defaultTopN, effectiveIds, liveIds, registerExtra } from '../lib/top.js';
const run = promisify(execFile);
const PIPELINE = fileURLToPath(new URL('./', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map(a => { const i=a.indexOf('='); return i<0 ? [a,true] : [a.slice(0,i),a.slice(i+1)]; }));
const repo = process.env.GOATLAB_REPO || '.';
const dir = args['--out'] || process.env.MEDIA_PACK_DIR || 'public/data/media-pack';
// R2 es el único almacén de la media (bucket goatlab → partidos/<id>/).
// Solo se activa con credenciales en el entorno (nunca del .env: los tests
// quedan herméticos). R2_PUBLIC_BASE es la URL pública (r2.dev).
const R2 = (process.env.R2_PUBLIC_BASE && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
  ? { base: process.env.R2_PUBLIC_BASE.replace(/\/$/,''), bucket: process.env.R2_BUCKET || 'goatlab' } : null;
const base = (process.env.MEDIA_GEN_BASE || (R2 ? R2.base : '') || 'https://goatlab-gateway.fly.dev/media-gen').replace(/\/$/,'');
const r2tool = join(repo, 'scripts/r2-media.mjs');
let r2A = 0, r2B = 0;
async function r2(cmd, ...a) {
  if (!R2) return null;
  try {
    const { stdout } = await run(process.execPath, [r2tool, cmd, ...a], { env: process.env, maxBuffer: 8 * 1024 * 1024 });
    if (cmd === 'exists') r2B += 1; else if (cmd !== 'record' && cmd !== 'public') r2A += 1;
    return JSON.parse(stdout);
  } catch { return null; }
}
async function r2download(url, file) {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    r2B += 1;
    return true;
  } catch { return false; }
}
const fixtures = JSON.parse(await readFile(join(repo,'public/data/fixtures.json'),'utf8'));
const topDefault = defaultTopN(process.env);
let topFile = null;
try {
  const raw = JSON.parse(await readFile(join(repo,'public/data',TOP_FILENAME),'utf8'));
  if (raw?.version === TOP_VERSION && Array.isArray(raw?.ranking) && raw.ranking.length) topFile = raw;
  else console.log('media: top.json inválido; recálculo en vivo');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  console.log('media: sin top.json; recálculo en vivo');
}
let matches;
if (args['--match']) {
  matches = selectMatches(fixtures.matches,{ onlyMatch:args['--match'], limit:args['--limit'] });
  if (!matches.length) matches=(fixtures.matches ?? []).filter(m=>m.id===args['--match']||m.webId===args['--match']);
  if (!matches.length) {
    // Partido ya jugado y fuera de fixtures: el guión conserva la identidad.
    try {
      const s = JSON.parse(await readFile(join(repo,'public/data/youtube-scripts',`${args['--match']}.json`),'utf8'));
      matches = [{ id: args['--match'], webId: args['--match'], home: s.home, away: s.away, competition: s.competition ?? null, kickoff: s.kickoff ?? null }];
      console.log(`media: ${args['--match']} fuera de fixtures; identidad del guión`);
    } catch {}
  }
  if (matches.length && !args['--content']) {
    const registered = registerExtra(topFile ?? { ranking: [], extra: [] }, matches.map(m=>m.webId ?? m.id));
    if (registered.added.length) {
      topFile = registered.top;
      await writeFile(join(repo,'public/data',TOP_FILENAME), JSON.stringify(topFile, null, 2));
      console.log(`media: extras manuales ${registered.added.join(', ')}`);
    }
  }
} else {
  const wanted = new Set(topFile ? effectiveIds(topFile, topDefault) : selectMatches(fixtures.matches,{ limit:args['--limit'] }).map(m=>m.webId ?? m.id));
  const byId = new Map((fixtures.matches ?? []).map(m=>[m.webId ?? m.id, m]));
  matches = [...wanted].map(id=>byId.get(id)).filter(m=>m && m.status==='NS').sort((a,b)=>(a.kickoff<b.kickoff?-1:1));
  if (args['--limit'] != null) matches = matches.slice(0, Math.max(1, Number(args['--limit'])));
}
if (!matches.length) throw new Error('No hay un partido disponible para el banco');
await mkdir(dir,{recursive:true});
/** Poda: manifiestos, progresos y gen/<id> fuera del conjunto a conservar.
 *  En el Action corre en batch; en Fly (--match, bajo demanda) conserva
 *  además el partido pedido para no borrar lo que se está generando. */
async function pruneMediaBank(packDir, keep) {
  const pruned = new Set();
  let names = []; try { names = await readdir(packDir); } catch {}
  for (const name of names) {
    const id = name.endsWith('.progress.json') ? name.slice(0,-14) : name.endsWith('.ready') ? name.slice(0,-6) : name.endsWith('.json') ? name.slice(0,-5) : null;
    if (id === null || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id) || keep.has(id)) continue;
    await rm(join(packDir, name), { force: true });
    pruned.add(id);
    console.log(`media: poda ${name}`);
  }
  let genNames = []; try { genNames = await readdir(join(packDir,'gen')); } catch {}
  for (const id of genNames) {
    if (keep.has(id)) continue;
    await rm(join(packDir,'gen',id), { recursive: true, force: true });
    pruned.add(id);
    console.log(`media: poda gen/${id}`);
  }
  // La media podada también sale de R2 (vida útil = poda). Mejor esfuerzo:
  // si R2 falla, lo local ya se podó y el siguiente ciclo lo reintenta.
  if (R2) for (const id of pruned) await r2('del-prefix', `partidos/${id}`);
}
if (!args['--match']) {
  // Poda: manifiestos y gen/ fuera del conjunto efectivo (top + extras) en la ventana NS.
  const live = liveIds(fixtures.matches);
  const keep = new Set((topFile ? effectiveIds(topFile, topDefault) : matches.map(m=>m.webId ?? m.id)).filter(id=>live.has(id)));
  await pruneMediaBank(dir, keep);
} else {
  // Poda en Fly: lo terminado sale con sus fotos y clips; lo vivo y lo pedido se conserva.
  const keep = new Set([...liveIds(fixtures.matches), ...matches.map(m=>m.webId ?? m.id)]);
  await pruneMediaBank(dir, keep);
}
let snapshot={};
if(args['--content']) snapshot=JSON.parse(await readFile(args['--content'],'utf8'));
for(const match of matches){
  const matchId=match.webId ?? match.id;
  // Sin --content (Action): los prompts salen del repo. Con --content
  // (Telegram): prioridad al snapshot, respaldo al repo por categoría.
  const repoPack = async cat => { try { return JSON.parse(await readFile(join(repo,'public/data',cat,`${matchId}.json`),'utf8')); } catch { return undefined; } };
  const imagePack=snapshot['image-prompts'] ?? await repoPack('image-prompts');
  const videoPack=snapshot['video-prompts'] ?? await repoPack('video-prompts');
  const motionPack=snapshot['motion-prompts'] ?? await repoPack('motion-prompts');
  let prev, progress, scorers;
  try{prev=JSON.parse(await readFile(join(dir,`${matchId}.json`),'utf8'));}catch{}
  try{progress=JSON.parse(await readFile(join(dir,`${matchId}.progress.json`),'utf8'));}catch{}
  try{scorers=JSON.parse(await readFile(join(repo,'public/data/scorers.json'),'utf8'));}catch{}
  const startedAt=Number.isFinite(progress?.attemptStartedAt)?progress.attemptStartedAt:Date.now();
  const deadline=startedAt+15*60_000, expiresAt=(Date.parse(match.kickoff)+86400_000)/1000;
  const failures=[];
  const imagePrompts=validateContent(imagePack,'image-prompts',matchId)?imagePack.prompts:[];
  const videoPrompts=validateContent(videoPack,'video-prompts',matchId)?videoPack.prompts:[];
  const motionPrompts=validateContent(motionPack,'motion-prompts',matchId)?motionPack.prompts:[];
  // Gate de shorts: en corrida batch solo partidos con guión + prompts de
  // fotos y vídeo. Motion es opcional (el montador lo cubre en local).
  let scripted=false;
  try{await readFile(join(repo,'public/data/youtube-scripts',`${matchId}.json`),'utf8');scripted=true;}catch{}
  if(!args['--match'] && (!scripted || !imagePrompts.length || !videoPrompts.length)){
    console.log(`media: ${matchId}: sin guión o prompts de shorts; omitido`);
    continue;
  }
  const folder=join(dir,'gen',matchId);
  await mkdir(folder,{recursive:true});
  const facts=motionPrompts.length?motionPack.facts:editingFacts(match,scorers);
  if(!imagePrompts.length)failures.push('Image Prompts no disponibles');
  if(!videoPrompts.length)failures.push('Video Prompts no disponibles');
  if(!motionPrompts.length)failures.push('Motion Prompts no disponibles; montaje local disponible');
  const publish=mediaPublisher({dir,match,facts,attemptStartedAt:startedAt,target:4});
  const assets=[];
  // Candado R2: con tope alcanzado se genera igual pero nada se sube.
  let r2blocked = false;
  if (R2) {
    const b = await r2('budget');
    if (b && b.level === 'block') { r2blocked = true; failures.push('R2: tope de presupuesto alcanzado; subidas pausadas (revisar Telegram)'); }
    else {
      // Reutilización: si R2 ya tiene el banco, se adopta sin gastar cuota Agnes.
      for (let index = 0; index < 4 && assets.length < 4; index++) {
        for (const ext of ['jpg', 'png', 'webp']) {
          const file = `${index}.${ext}`;
          try { await readFile(join(folder, file)); break; } catch {}
          const found = await r2('exists', `partidos/${matchId}/${file}`);
          if (!found) continue;
          if (!(await r2download(`${R2.base}/partidos/${encodeURIComponent(matchId)}/${file}`, join(folder, file)))) continue;
          const m = found.meta ?? {};
          const image = { ...normalizeAgnesImage({ matchId, index, publicUrl: `${base}/${encodeURIComponent(matchId)}/${file}`, model: m.model, prompt: m.prompt || imagePrompts[index]?.prompt, at: m.at }), width: Number(m.width) || 1472, height: Number(m.height) || 2624, prepared: true };
          if (!assetErrors(image).length) assets.push(image);
          break;
        }
      }
    }
  }
  const skipImages=process.env.AGNES_SKIP_IMAGES==='1', skipVideo=process.env.AGNES_SKIP_VIDEO==='1';
  // Shared ledger: images and clips draw from the same daily Token Plan quota pool.
  const stateDb=process.env.AGNES_STATE_DB ?? join(dir,'agnes.sqlite');
  const childEnv={...process.env,AGNES_STATE_DB:stateDb};
  for(const asset of prev?.assets ?? []){
    if(asset.source!=='agnes'||assetErrors(asset).length||assets.length>=4||assets.some(a=>a.id===asset.id))continue;
    const file=new URL(asset.url).pathname.split('/').at(-1);
    if(!/^\d+\.(jpg|png|webp)$/.test(file))continue;
    const index=Number(file.split('.')[0]);
    if(imagePrompts.length && asset.query!==imagePrompts[index]?.prompt)continue;
    try{await readFile(join(folder,file));assets.push(asset);}catch{}
  }
  let clips=[];
  for(const clip of prev?.clips ?? []){try{if(/^clip-\d+\.mp4$/.test(clip.file)&&clip.source==='agnes'&&clips.length<2){await readFile(join(folder,clip.file));clips.push(clip);}}catch{}}
  if (R2 && !r2blocked) {
    for (let ordinal = 0; ordinal < 2 && clips.length < 2; ordinal++) {
      const file = `clip-${ordinal}.mp4`;
      if (clips.some(c=>c.id === `${matchId}-clip-${ordinal}`)) continue;
      try { await readFile(join(folder, file)); continue; } catch {}
      const found = await r2('exists', `partidos/${matchId}/${file}`);
      if (!found) continue;
      if (!(await r2download(`${R2.base}/partidos/${encodeURIComponent(matchId)}/${file}`, join(folder, file)))) continue;
      const m = found.meta ?? {};
      clips.push({ id: `${matchId}-clip-${ordinal}`, source: 'agnes', file, url: `${base}/${encodeURIComponent(matchId)}/${file}`, width: Number(m.width) || 720, height: Number(m.height) || 1280, duration: Number(m.duration) || 6, model: m.model || 'agnes-video-2.5-flash' });
    }
  }
  const extras=()=>({clips,motionPrompts,failures,contentVersion:1});
  await publish(assets,'generating',extras());
  if(!process.env.AGNES_API_KEY?.trim())failures.push('falta AGNES_API_KEY');
  if(process.env.AGNES_API_KEY?.trim() && !skipImages){
    for(const [index,row]of imagePrompts.entries()){
      if(assets.some(a=>a.id===`${matchId}-${index}`))continue;
      const timeout=Number(process.env.AGNES_TIMEOUT_SECONDS||300);
      if(Date.now()+timeout*1000+35000>deadline){failures.push('Imágenes: presupuesto de preparación agotado');break;}
      const promptFile=join(folder,`${index}.prompt.txt`);await writeFile(promptFile,row.prompt);
      try{
        const {stdout}=await run(process.env.PYTHON_BIN||'python3',[join(PIPELINE,'agnes.py'),`--match=${matchId}`,`--index=${index}`,`--expires-at=${expiresAt}`,`--attempt-deadline=${deadline/1000}`,`--prompt-file=${promptFile}`,`--out=${folder}`],{env:childEnv,timeout:Math.max(1,deadline-Date.now()),maxBuffer:1024*1024});
        const saved=JSON.parse(stdout);
        if(saved.prompt!==row.prompt)throw new Error('El slot existente pertenece a otra versión de prompts');
        const image={...normalizeAgnesImage({matchId,index,publicUrl:`${base}/${encodeURIComponent(matchId)}/${saved.file}`,model:saved.model,prompt:saved.prompt,at:saved.at}),width:saved.width,height:saved.height,prepared:true};
        if(assetErrors(image).length)throw new Error('imagen inválida');
        assets.push(image);await publish(assets,'generating',extras());
        if (R2 && !r2blocked) {
          const up = await r2('put', join(folder, saved.file), `partidos/${matchId}/${saved.file}`,
            saved.file.endsWith('.png') ? 'image/png' : saved.file.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
            `model=${saved.model}`, `prompt=${row.prompt}`, `at=${saved.at}`, `width=${saved.width}`, `height=${saved.height}`);
          if (!up) failures.push(`R2: no se pudo subir ${saved.file}; el banco local sigue válido`);
        }
      }catch(error){const reason=String(error.stderr||error.message).trim().slice(0,180);failures.push(`Imagen ${index+1}: ${reason}`);if(/429|incierto|pausado|cuota/.test(reason))break;}
    }
    await publish(assets,'generating-clips',extras());
    if(!skipVideo&&videoPrompts.length&&assets.length&&clips.length<2&&Date.now()+1000<deadline){
      const input=join(folder,'video-input.json');await writeFile(input,JSON.stringify({matchId,prompts:videoPrompts,images:assets,deadline:deadline/1000,expiresAt}));
      try{
        const {stdout}=await run(process.env.PYTHON_BIN||'python3',[join(PIPELINE,'agnes_video.py'),`--input=${input}`,`--out=${folder}`],{env:childEnv,timeout:Math.max(1,deadline-Date.now()+500),maxBuffer:1024*1024});
        const result=JSON.parse(stdout);failures.push(...result.failures);
        clips=[...new Map([...clips,...result.clips.map(c=>({...c,id:`${matchId}-clip-${c.index}`,source:'agnes',url:`${base}/${encodeURIComponent(matchId)}/${c.file}`}))].map(c=>[c.id,c])).values()].slice(0,2);
        if (R2 && !r2blocked) for (const c of result.clips ?? []) {
          const up = await r2('put', join(folder, c.file), `partidos/${matchId}/${c.file}`, 'video/mp4',
            `model=agnes-video-2.5-flash`, `duration=${c.duration ?? 6}`, `width=${c.width ?? 720}`, `height=${c.height ?? 1280}`);
          if (!up) failures.push(`R2: no se pudo subir ${c.file}; el banco local sigue válido`);
        }
      }catch(error){failures.push(`Clips: ${String(error.stderr||error.message).slice(0,180)}`);}
    }
  }
  await publish(assets,'finished',extras());
  // Libro de operaciones R2 (solo el Action lo commitea; en Fly es local y efímero).
  if (R2 && process.env.GITHUB_ACTIONS) await r2('record', String(r2A), String(r2B));
  console.log(`media: ${matchId}: ${assets.length}/4 imágenes, ${clips.length}/2 clips; ${failures.join('; ')}`);
}
