import {mkdirSync,copyFileSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {renderRemotion} from '../fly/render/remotion-render.mjs';
import {catalog,validateCinema} from '../src/lib/cinema-plan.js';
const dir=resolve('.cache/cinema-effects');mkdirSync(dir,{recursive:true});
for(const file of ['0.jpg','1.jpg'])copyFileSync(join('.cache/shorts-review',file),join(dir,file));
copyFileSync('fly/render/assets/LiberationSans-Bold.ttf',join(dir,'LiberationSans-Bold.ttf'));copyFileSync('fly/gateway/workspace/skills/goatlab/assets/brand.svg',join(dir,'brand.svg'));
const words='La racha cambia el duelo'.split(' ').map((word,i)=>({word,start:.1+i*.4,end:.4+i*.4}));
const facts=[{id:'a',label:'Chelsea · victorias',value:4,unit:'partidos',source:'test',sampleSize:5},{id:'b',label:'Bournemouth · victorias',value:2,unit:'partidos',source:'test',sampleSize:5}];
const base={start:0,end:3,composition:'editorial',variant:'headline',wordStart:0,wordEnd:5,factIds:[],camera:'hold',reveal:'fade',transition:'cut',emphasis:'none',distinctive:'none'};
const props={frames:180,font:'LiberationSans-Bold.ttf',brand:'brand.svg',words,facts,photos:[{src:'0.jpg',backdrop:'0.jpg',focusBlur:'0.jpg',width:1472,height:2624}],clips:[],match:'Chelsea vs Bournemouth'};
let index=0;const report=[];
async function shot(scene,frame,name) {
 const plan={version:5,scenes:[scene]};validateCinema(plan,{span:3,...props});writeFileSync(join(dir,'composition.json'),JSON.stringify({...props,plan}));
 const output=join(dir,`${String(index++).padStart(2,'0')}-${name}.jpg`);await renderRemotion(dir,null,{stillFrames:[{frame,output}]});
 return {file:output,hash:createHash('sha256').update(readFileSync(output)).digest('hex')};
}
for(const [family,variants] of Object.entries(catalog.families)) {
 const scene={...base,composition:family,variant:variants[0],...(family==='protagonist'?{asset:0}:{}),factIds:family==='primary-stat'?['a']:family==='comparison'?['a','b']:[]};
 const a=await shot(scene,45,family+'-'+variants[0]),b=await shot({...scene,variant:variants[1]},45,family+'-'+variants[1]);report.push({control:family,changed:a.hash!==b.hash,files:[a.file,b.file]});
}
for(const [key,value] of [['camera','push'],['camera','pull'],['reveal','stagger'],['emphasis','underline'],['distinctive','slam']]) {
 const frame=key==='camera'?45:10;
 const a=await shot(base,frame,key+'-baseline'),b=await shot({...base,[key]:value},frame,key+'-'+value);report.push({control:key+'/'+value,changed:a.hash!==b.hash,files:[a.file,b.file]});
}
const encounter={...base,composition:'encounter',variant:'duel'};
const a=await shot(encounter,10,'duel-base'),b=await shot({...encounter,distinctive:'duel'},10,'duel-effect');report.push({control:'distinctive/duel',changed:a.hash!==b.hash,files:[a.file,b.file]});
writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.map(({control,changed})=>({control,changed}))));
if(report.some(r=>!r.changed))process.exitCode=1;
