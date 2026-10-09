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
function motionRow(n, kind, factIds = []) {
  const id = factIds.length ? factIds.map(id => `{{${id}}}`).join(' ') : '';
  return { n, kind, title: kind, factIds, presentations: ['editorial', 'statistical'],
    beats: [{ t0: 0, t1: 1.5, action: 'entry', detail: 'headline rises' }, { t0: 1.5, t1: 4.5, action: 'build', detail: 'bars grow' }, { t0: 4.5, t1: 7.5, action: 'main', detail: 'count up' }, { t0: 7.5, t1: 9.5, action: 'exit', detail: 'collapse' }],
    easing: { enter: 'ease-out', curve: 'cubic-bezier(0.23,1,0.32,1)', exit: 'ease-out' },
    background: { variant: 'carbon-grain', base: '#101412', texture: 'grain', safeArea: 'left64 right64 top120 bottom480' },
    motion: { spring: { damping: 22, stiffness: 180, mass: 0.6 }, countUp: true, staggerMs: 60, scaleFrom: 0.95 },
    camera: { move: 'push-in 1.0 to 0.9 + drift', tilt: '0deg' },
    transition: { in: 'wipe', editorialToStatistical: 'dissolve', out: 'collapse' },
    emphasis_words: ['CLAVE'],
    motionSystem: 'carbon-v1',
    signature_move: 'stagger-reveal',
    prompt: `Vertical 9:16 Spanish labels, source and sample, transition editorial statistical. ${id} ${kind} ` + 'Detailed layout and timing with legible labels and clear baseline. '.repeat(17) };
}

function images(){return{version:1,category:'image-prompts',matchId:'alpha-beta',home:'Alpha',away:'Beta',prompts:CONTENT_CATEGORIES['image-prompts'].kinds.map((kind,i)=>({n:i+1,kind,title:kind,prompt:`Referential photorealistic illustration of Alpha and Beta football teams interacting in realistic uniforms, vertical 9:16. ${kind} ${'Natural lighting, realistic anatomy and team colours, context only. '.repeat(3)} ${kind==='stadium'?'Stadium, flags and team crests.':kind==='supporters'?'Both groups of supporters.':''}`}))};}
test('image contract requires exactly four ordered scenes, both teams and stadium identity',()=>{
  const data=images();assert.ok(validateContent(data,data.category,data.matchId));
  data.prompts[3].prompt=data.prompts[3].prompt.replace('flags','banners');assert.ok(promptErrors(data).some(e=>e.includes('presentación')));
  data.prompts[0].prompt=data.prompts[0].prompt.replace('Beta','Gamma');assert.ok(promptErrors(data).some(e=>e.includes('ambos equipos')));
  data.prompts.pop();assert.ok(promptErrors(data).some(e=>e.includes('4')));
});
test('motion rejects unknown facts and percentages when publication is closed',()=>{
  const data={category:'motion-prompts',home:'Alpha',away:'Beta',facts:[{id:'home.gf',value:4}],prompts:CONTENT_CATEGORIES['motion-prompts'].kinds.slice(0,5).map((kind,i)=>motionRow(i+1,kind,['home.gf']))};
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
  const data={category:'motion-prompts',home:'Alpha',away:'Beta',facts:[],prompts:CONTENT_CATEGORIES['motion-prompts'].kinds.slice(0,5).map((kind,i)=>{ const r=motionRow(i+1,kind,[]); delete r.presentations; return r; })};
  assert.ok(promptErrors(data).some(e=>e.includes('presentaciones')));
  for(const row of data.prompts)row.presentations=['editorial','statistical'];
  assert.deepEqual(promptErrors(data),[]);
  data.prompts[0].presentations=['editorial','invented'];
  assert.ok(promptErrors(data).some(e=>e.includes('presentaciones')));
});
test('motion count is decided by the model between two and thirty scenes',()=>{
  const scene=(n,kind)=>motionRow(n,kind,[]);
  const valid={category:'motion-prompts',version:2,matchId:'alpha-beta',home:'Alpha',away:'Beta',facts:[],prompts:[scene(1,'form'),scene(2,'goals')]};
  assert.ok(validateContent(valid,'motion-prompts','alpha-beta'));
  const one={...valid,prompts:[scene(1,'form')]};
  assert.ok(promptErrors(one).some(e=>e.includes('2 y 30')));
  const eleven={...valid,prompts:Array.from({length:31},(_,i)=>scene(i+1,'form'))};
  assert.ok(promptErrors(eleven).some(e=>e.includes('2 y 30')));
  const alien={...valid,prompts:[scene(1,'form'),{...scene(2,'goals'),kind:'invented'}]};
  assert.ok(promptErrors(alien).some(e=>e.includes('catálogo')));
});
