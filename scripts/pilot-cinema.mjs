// Offline delivery: uses the same worker preparation/render/QA without Telegram sends.
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {prepareShort,renderSilent,renderWithFallback,muxVoice,mediaDuration,SKILL_ROOT} from '../fly/render/short-job.mjs';
import {reviewAndCorrect,motionMetrics} from '../fly/render/visual-qa.mjs';
import {contentMatches,matchProduction} from '../src/lib/content-store.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const matchId=args.match??'chelsea-vs-bournemouth-2026-10-10';
const dir=resolve(args.dir??'.cache/cinema-pilot');
const match=contentMatches().find(m=>m.matchId===matchId);
if(!match)throw new Error('partido desconocido');
const context=matchProduction(match);
const bankPath=args.bank??(existsSync(join(dir,'media-bank.json'))?join(dir,'media-bank.json'):`public/data/media-pack/${matchId}.json`);
const bank=existsSync(bankPath)?JSON.parse(readFileSync(bankPath)):{};
process.env.GOATLAB_CINEMA_V5='1';
const reports=[],usedVariants=[];
for(let ordinal=1;ordinal<=5;ordinal++) {
 const audio=join(dir,`audio-${ordinal}.ogg`);
 if(!existsSync(audio))continue;
 const tmp=join(dir,`video-${ordinal}`);mkdirSync(tmp,{recursive:true});
 const at=Date.now();
 try {
  const prepared=await prepareShort({tmp,voiceFile:audio,voiceSeconds:await mediaDuration(audio),assets:args.empty?[]:bank.assets??[],clips:args.empty?[]:bank.clips??[],facts:context.facts,productionContext:context,usedVariants,variant:ordinal-1,home:match.home,away:match.away,matchLabel:`${match.home} vs ${match.away}`,requestId:`cinema-pilot-${ordinal}`,planner:args.replay?async(source,tmp)=>{writeFileSync(join(tmp,'edit-input.json'),JSON.stringify(source));return JSON.parse(readFileSync(join(tmp,'edit-plan.json'),'utf8'));}:undefined,log:line=>console.log(line)});
  const silent=join(tmp,'silent.mp4'),out=join(tmp,'short.mp4');
  const capture=await renderWithFallback(tmp,silent);prepared.plan=capture.plan;await muxVoice({silent,voiceFile:prepared.voiceFile,total:prepared.total,out});
  const motion=motionMetrics(prepared.plan,prepared.total);usedVariants.push(...motion.variants);
  const qa=args['skip-vision']?{severity:'unavailable',issues:['piloto sin visión solicitada']}:await reviewAndCorrect({tmp,video:out,total:prepared.total,skillRoot:SKILL_ROOT,allowCorrection:!capture.renderFallback,render:()=>renderSilent(tmp,silent),mux:()=>muxVoice({silent,voiceFile:prepared.voiceFile,total:prepared.total,out})});
  reports.push({ordinal,replayed:Boolean(args.replay),total:prepared.total,motion,model:prepared.plan.model,fallback:prepared.plan.fallback??false,attempts:prepared.plan.attempts,qa,elapsedMs:Date.now()-at,video:out,stages:prepared.stages});
  console.log(JSON.stringify({ordinal,status:'rendered',model:prepared.plan.model,qa:qa.severity,motion}));
 } catch(error) { reports.push({ordinal,error:error.message,elapsedMs:Date.now()-at});console.error(`pilot ${ordinal}: ${error.message}`); }
 writeFileSync(join(dir,'pilot-report.json'),JSON.stringify(reports,null,2));
}
if(!reports.length)throw new Error('no hay audios audio-1.ogg … audio-5.ogg');
if(reports.some(r=>r.error||r.qa?.severity==='severe'))process.exitCode=1;
