import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT_CATEGORIES, CONTENT_PROVIDER_ORDER, promptErrors, validateContent, contentUrl } from '../src/lib/match-content.js';
import { resolveChain } from '../src/lib/llm.js';
import { compositionProps } from '../src/lib/edit-plan.js';

const env = { OPENCODE_GO_API_KEY:'a', MISTRAL_API_KEY:'b', WORKERS_AI_API_KEY:'c', CLOUDFLARE_ACCOUNT_ID:'d', SCRIPT_PROVIDER_ORDER:CONTENT_PROVIDER_ORDER };
test('content priority starts with DeepSeek and keeps the independent analysis default',()=>{
  const chain=resolveChain(env,console,{orderVar:'SCRIPT_PROVIDER_ORDER'});
  assert.deepEqual(chain.map(p=>p.model),['deepseek-v4.1-flash','glm-5.3-flash','ministral-8b-2512','@cf/zai-org/glm-4.7-flash']);
  assert.equal(resolveChain(env)[0].id,'MISTRAL');
});
function images(){return{version:1,category:'image-prompts',matchId:'alpha-beta',home:'Alpha',away:'Beta',prompts:CONTENT_CATEGORIES['image-prompts'].kinds.map((kind,i)=>({n:i+1,kind,title:kind,prompt:`Referential photorealistic illustration of Alpha and Beta football teams interacting in realistic uniforms, vertical 9:16. ${kind} ${'Natural lighting, realistic anatomy and team colours, context only. '.repeat(3)} ${kind==='stadium'?'Stadium, flags and team crests.':kind==='supporters'?'Both groups of supporters.':''}`}))};}
test('image contract requires exactly four ordered scenes, both teams and stadium identity',()=>{
  const data=images();assert.ok(validateContent(data,data.category,data.matchId));
  data.prompts[3].prompt=data.prompts[3].prompt.replace('flags','banners');assert.ok(promptErrors(data).some(e=>e.includes('presentación')));
  data.prompts[0].prompt=data.prompts[0].prompt.replace('Beta','Gamma');assert.ok(promptErrors(data).some(e=>e.includes('ambos equipos')));
  data.prompts.pop();assert.ok(promptErrors(data).some(e=>e.includes('4')));
});
test('clip adapter preserves verified ranges and accepts legacy plan version 3', () => {
  const input={frames:270,photos:[],clips:[{src:'clip.mp4',width:720,height:1280,duration:6}],words:[{word:'Datos',start:0,end:1}],plan:{version:3,scenes:[{start:0,end:6,layers:[],clips:[{clip:0,offset:1,duration:4}]}]}};
  assert.equal(compositionProps(input).plan.scenes[0].clips[0].offset,1);
  input.plan.scenes[0].clips[0].offset=5;
  assert.throws(()=>compositionProps(input),/recorte/);
  assert.equal(contentUrl('alpha-beta','scripts',true),'/partido/alpha-beta/scripts.json');
});


test('retired motion category has no route or public contract', () => {
  assert.equal(CONTENT_CATEGORIES['motion-prompts'], undefined);
  assert.throws(() => contentUrl('alpha-beta', 'motion-prompts'), /desconocida/);
  assert.equal(validateContent({ category: 'motion-prompts' }, 'motion-prompts', 'alpha-beta'), false);
});
