import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configureModels} from '../fly/gateway/model-config.mjs';
import {motionMetrics} from '../fly/render/visual-qa.mjs';
import {productionContext} from '../src/lib/production-context.js';
import {readFileSync} from 'node:fs';
test('Gateway selector remains editable across restarts',()=>{
 const original=readFileSync('fly/gateway/openclaw.json','utf8');
 const first=configureModels(original,{});
 const changed=configureModels(first,{GOATLAB_AGENT_MODELS:'mistral/mistral-small-2603,opencode-go/mimo-v2.6-flash'});
 assert.match(changed,/primary: "mistral\/mistral-small-2603"/);
 assert.throws(()=>configureModels(original,{GOATLAB_AGENT_MODELS:'unknown/model'}));
});
test('motion metrics count dominant scenes and repeated executed effects',()=>{
 const report=motionMetrics({scenes:[{start:0,end:4,composition:'protagonist',variant:'full'},{start:4,end:8,composition:'editorial',variant:'headline',distinctive:'slam'},{start:8,end:12,composition:'resolution',variant:'statement',distinctive:'slam'}]},15);
 assert.equal(report.graphicPercentOfNarrative,66.7);assert.equal(report.graphicPercentOfVideo,53.3);assert.equal(report.distinctiveOccurrences,2);
});
test('production context needs no generated prompts and hashes reproducibly',()=>{
 const match=JSON.parse(readFileSync('public/data/fixtures.json')).matches[0];
 const options={generatedAt:'2026-10-10T00:00:00Z'};
 const a=productionContext(match,options),b=productionContext(match,options);
 assert.equal(a.version,1);assert.equal(a.hash,b.hash);assert.ok(a.facts.every(f=>f.source&&f.unit&&Number.isFinite(f.value)));
});
import {validateCinema} from '../src/lib/cinema-plan.js';
test('v5 rejects unsupported controls and incompatible comparisons',()=>{
 const scene={start:0,end:4,composition:'editorial',variant:'headline',wordStart:0,wordEnd:1,factIds:[]};
 const source={span:4,words:[{word:'Racha',start:.5,end:1}]};
 assert.doesNotThrow(()=>validateCinema({version:5,scenes:[scene]},source));
 assert.throws(()=>validateCinema({version:5,scenes:[{...scene,camera:'orbit'}]},source));
 assert.throws(()=>validateCinema({version:5,scenes:[{...scene,unusedPrompt:'abc'}]},source));
 const facts=[{id:'a',value:1,unit:'goles',source:'fixture'},{id:'b',value:2,unit:'partidos',source:'fixture'}];
 assert.throws(()=>validateCinema({version:5,scenes:[{...scene,composition:'comparison',variant:'bars',factIds:['a','b']}]},{...source,facts}));
});
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {reviewAndCorrect} from '../fly/render/visual-qa.mjs';
test('one correction and a failed recheck retain a known severe defect',async()=>{
 const tmp=mkdtempSync(join(tmpdir(),'cinema-qa-'));writeFileSync(join(tmp,'composition.json'),JSON.stringify({plan:{}}));
 let calls=0,renders=0,muxes=0;
 try {
  const qa=await reviewAndCorrect({tmp,video:'unused',total:9,skillRoot:'unused',render:async()=>renders++,mux:async()=>muxes++,review:async({recheck})=>{calls++;if(recheck)throw new Error('offline');return {severity:'severe',model:'opencode-go/mimo-v2.6-flash',repair:{fontScale:.9},issues:['caption overlap']};}});
  assert.equal(qa.severity,'severe');assert.equal(calls,2);assert.equal(renders,1);assert.equal(muxes,1);assert.equal(JSON.parse(readFileSync(join(tmp,'composition.json'))).plan.tweaks.fontScale,.9);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
test('an initial vision outage permits deterministic delivery without rendering again',async()=>{
 const qa=await reviewAndCorrect({tmp:'unused',video:'unused',total:9,skillRoot:'unused',render:()=>assert.fail('no second render'),mux:()=>assert.fail('no mux'),review:async()=>{throw new Error('offline');}});
 assert.equal(qa.severity,'unavailable');assert.equal(qa.renderCorrections,0);
});
