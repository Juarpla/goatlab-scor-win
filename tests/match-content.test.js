import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT_CATEGORIES, CONTENT_PROVIDER_ORDER, promptErrors, validateContent, contentUrl } from '../src/lib/match-content.js';
import { resolveChain } from '../src/lib/llm.js';
import { compositionProps } from '../src/lib/edit-plan.js';

const env = { OPENCODE_GO_API_KEY:'a', MISTRAL_API_KEY:'b', WORKERS_AI_API_KEY:'c', CLOUDFLARE_ACCOUNT_ID:'d', SCRIPT_PROVIDER_ORDER:CONTENT_PROVIDER_ORDER };
test('content priority starts with MiMo and keeps the independent analysis default',()=>{
  const chain=resolveChain(env,console,{orderVar:'SCRIPT_PROVIDER_ORDER'});
  assert.deepEqual(chain.map(p=>p.model),['mimo-v2.6-flash','deepseek-v4.1-flash','ministral-8b-2512','@cf/zai-org/glm-4.7-flash']);
  assert.equal(resolveChain(env)[0].id,'MISTRAL');
});
function images(){return{version:1,category:'image-prompts',matchId:'alpha-beta',home:'Alpha',away:'Beta',prompts:CONTENT_CATEGORIES['image-prompts'].kinds.map((kind,i)=>({n:i+1,kind,title:kind,prompt:`Referential photorealistic illustration of Alpha and Beta football teams interacting in realistic uniforms, vertical 9:16. ${kind} ${'Natural lighting, realistic anatomy and team colours, context only. '.repeat(3)} ${kind==='stadium'?'Stadium, flags and team crests.':kind==='supporters'?'Both groups of supporters.':''}`}))};}
test('image contract requires exactly ten ordered scenes, both teams and stadium identity',()=>{
  const data=images();assert.ok(validateContent(data,data.category,data.matchId));
  data.prompts[9].prompt=data.prompts[9].prompt.replace('flags','banners');assert.ok(promptErrors(data).some(e=>e.includes('presentación')));
  data.prompts[0].prompt=data.prompts[0].prompt.replace('Beta','Gamma');assert.ok(promptErrors(data).some(e=>e.includes('ambos equipos')));
  data.prompts.pop();assert.ok(promptErrors(data).some(e=>e.includes('10')));
});
test('motion rejects unknown facts and percentages when publication is closed',()=>{
  const data={category:'motion-prompts',home:'Alpha',away:'Beta',facts:[{id:'home.gf',value:4}],prompts:CONTENT_CATEGORIES['motion-prompts'].kinds.map((kind,i)=>({n:i+1,kind,title:kind,factIds:['home.gf'],prompt:`Vertical 9:16 Spanish labels, source and sample, transition. {{home.gf}} ${kind} `+'Detailed layout and timing with legible labels and clear baseline. '.repeat(17)}))};
  assert.deepEqual(promptErrors(data),[]);
  data.prompts[0].factIds=['invented'];assert.ok(promptErrors(data).some(e=>e.includes('hechos inválida')));
  data.prompts[1].prompt+=' 70%';assert.ok(promptErrors(data).some(e=>e.includes('porcentajes')));
});
test('clip adapter preserves verified ranges and accepts legacy plan version 3', () => {
  const input={frames:270,photos:[],clips:[{src:'clip.mp4',width:720,height:1280,duration:6}],words:[{word:'Datos',start:0,end:1}],plan:{version:3,scenes:[{start:0,end:6,layers:[],clips:[{clip:0,offset:1,duration:4}]}]}};
  assert.equal(compositionProps(input).plan.scenes[0].clips[0].offset,1);
  input.plan.scenes[0].clips[0].offset=5;
  assert.throws(()=>compositionProps(input),/recorte/);
  assert.equal(contentUrl('alpha-beta','scripts',true),'/partido/alpha-beta/scripts.json');
});

test('balanced motion metadata preserves old prompts and rejects invalid presentations',()=>{
  const data={category:'motion-prompts',home:'Alpha',away:'Beta',facts:[],prompts:CONTENT_CATEGORIES['motion-prompts'].kinds.map((kind,i)=>({n:i+1,kind,title:kind,factIds:[],prompt:`Vertical 9:16 Spanish source sample transition ${kind}. `+'Detailed editorial and statistical composition with timing and readable labels. '.repeat(18)}))};
  assert.deepEqual(promptErrors(data),[]);
  for(const row of data.prompts)row.presentations=['editorial','statistical'];
  assert.deepEqual(promptErrors(data),[]);
  data.prompts[0].presentations=['editorial','invented'];
  assert.ok(promptErrors(data).some(e=>e.includes('presentaciones')));
});
