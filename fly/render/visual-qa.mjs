import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const run=promisify(execFile);
export function motionMetrics(plan,total) {
  const span=plan.scenes.at(-1)?.end??0;
  const graphicSeconds=plan.scenes.reduce((n,s)=>n+(s.composition?s.composition!=='protagonist'?s.end-s.start:0:(s.graphics?.length && !s.layers?.length && !s.clips?.length)?s.end-s.start:0),0);
  return {definition:'Escenas dominadas por gráficos; excluye subtítulos y cierre.',graphicSeconds:+graphicSeconds.toFixed(2),graphicPercentOfVideo:+(100*graphicSeconds/total).toFixed(1),graphicPercentOfNarrative:+(100*graphicSeconds/Math.max(.01,span)).toFixed(1),scenes:plan.scenes.length,variants:[...new Set(plan.scenes.filter(s=>s.composition).map(s=>s.composition+'/'+s.variant))],distinctiveOccurrences:plan.scenes.filter(s=>s.distinctive && s.distinctive!=='none').length};
}
export async function visualReview({tmp,video,total,skillRoot,recheck=false,preferredModel,isCancelled=()=>false}) {
  const props=JSON.parse(readFileSync(join(tmp,'composition.json'),'utf8'));
  const times=[.08,.22,.4,.58,.76,.92].map(f=>Math.min(total-.1,Math.max(.1,(total-3)*f)));
  const frames=[];
  for(let i=0;i<times.length;i++) {
    if(isCancelled()) throw new Error('cancelled');
    const path=join(tmp,`qa-${i}.jpg`);
    await run('ffmpeg',['-y','-loglevel','error','-ss',String(times[i]),'-i',video,'-frames:v','1','-vf','scale=540:960',path],{timeout:30000});
    frames.push('data:image/jpeg;base64,'+readFileSync(path).toString('base64'));
  }
  const input=join(tmp,'vision-input.json'),out=join(tmp,'vision-report.json');
  writeFileSync(input,JSON.stringify({frames,recheck,preferredModel,context:{match:props.match,facts:props.facts,words:props.words,plan:props.plan,frameTimes:times}}));
  await run(process.env.PYTHON_BIN??'python3',[join(skillRoot,'scripts/vision.py'),'--input',input,'--out',out],{timeout:recheck?65000:185000,maxBuffer:1048576});
  return {...JSON.parse(readFileSync(out,'utf8')),frameTimes:times};
}
/** One bounded repair; a failed recheck never clears a known severe defect. */
export async function reviewAndCorrect({tmp,video,total,skillRoot,render,mux,isCancelled=()=>false,review=visualReview,allowCorrection=true}) {
  let qa;
  try {qa=await review({tmp,video,total,skillRoot,isCancelled});}
  catch {return {severity:'unavailable',issues:['visión no disponible'],renderCorrections:0};}
  if(!allowCorrection)return {...qa,renderCorrections:0,correctionBudgetConsumed:true};
  if(qa.severity!=='severe'||!Object.keys(qa.repair??{}).length)return {...qa,renderCorrections:0};
  if(isCancelled())throw new Error('cancelled');
  const props=JSON.parse(readFileSync(join(tmp,'composition.json'),'utf8'));
  props.plan.tweaks={...props.plan.tweaks,...qa.repair};
  writeFileSync(join(tmp,'composition.json'),JSON.stringify(props));
  await render();await mux();
  try {return {...await review({tmp,video,total,skillRoot,recheck:true,preferredModel:qa.model,isCancelled}),initial:qa,renderCorrections:1};}
  catch {return {severity:'severe',issues:['No se pudo verificar la corrección'],initial:qa,renderCorrections:1};}
}
