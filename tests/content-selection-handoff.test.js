import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readContentSelection } from '../src/lib/content-selection.js';
import { contentMatches } from '../src/lib/top.js';
const capture = resolve('scripts/content-selection.mjs');
async function fixture(t) {
 const repo=await mkdtemp(join(tmpdir(),'goatlab-handoff-'));t.after(()=>rm(repo,{recursive:true,force:true}));
 const data=join(repo,'public/data');await mkdir(data,{recursive:true});
 const matches=Array.from({length:8},(_,i)=>({id:`af-${i}`,webId:`game-${i}`,home:`Home ${i}`,away:`Away ${i}`,competition:'test',status:'NS',kickoff:new Date(Date.now()+86400000).toISOString()}));
 const top={version:1,generatedAt:new Date().toISOString(),n:5,priority:8,ranking:matches.slice(0,7).map(m=>({id:m.webId})),extra:['old-manual']};
 await writeFile(join(data,'fixtures.json'),JSON.stringify({matches}));await writeFile(join(data,'top.json'),JSON.stringify(top));
 const run=(env={},args=[])=>spawnSync(process.execPath,[capture,...args],{cwd:repo,encoding:'utf8',env:{...process.env,CONTENT_SELECTION_FILE:'.cache/content-selection.json',...env}});
 return {repo,data,matches,top,run};
}
test('automatic snapshot fixes the same five for every consumer even if main changes',async t=>{
 const f=await fixture(t);const result=f.run({CONTENT_AUTOMATIC:'1',SCRIPT_TOP_N:'99'});assert.equal(result.status,0,result.stderr);
 const original=await readFile(join(f.data,'top.json'),'utf8');
 await writeFile(join(f.data,'top.json'),JSON.stringify({...f.top,ranking:[{id:'game-7'}]}));
 await writeFile(join(f.data,'fixtures.json'),JSON.stringify({matches:[f.matches[7]]}));
 const selected=await readContentSelection({repo:f.repo,env:{CONTENT_SELECTION_FILE:'.cache/content-selection.json'}});
 assert.deepEqual(contentMatches(selected.top,selected.fixtures.matches,{automatic:true}).map(m=>m.webId),f.matches.slice(0,5).map(m=>m.webId));
 assert.equal(selected.request.automatic,true);
 assert.equal(JSON.parse(original).extra.length,1);
});
test('manual provider ID stays additive, activates the same downstream request and preserves old artifacts',async t=>{
 const f=await fixture(t);const preserved=[];
 for(const category of ['youtube-scripts','media-pack','image-prompts','video-prompts','motion-prompts']){
  const path=join(f.data,category,'existing.json');await mkdir(join(f.data,category));await writeFile(path,'{"old":"untouched"}');preserved.push(path);
 }
 const result=f.run({CONTENT_AUTOMATIC:'0',MATCH:'af-7'});assert.equal(result.status,0,result.stderr);
 const snapshot=JSON.parse(await readFile(join(f.repo,'.cache/content-selection.json')));assert.deepEqual(snapshot.ids,['game-7']);
 const top=JSON.parse(await readFile(join(f.data,'top.json')));assert.deepEqual(top.ranking,f.top.ranking);assert.deepEqual(top.extra,['old-manual','game-7']);
 const envFile=join(f.repo,'github-env');const activate=f.run({GITHUB_ENV:envFile},['--activate-media']);assert.equal(activate.status,0,activate.stderr);
 assert.match(await readFile(envFile,'utf8'),/CONTENT_AUTOMATIC=0\nMATCH=af-7\n/);
 for(const path of preserved)assert.equal(await readFile(path,'utf8'),'{"old":"untouched"}');
});
test('unknown or unsafe manual IDs fail without registering extras or deleting anything',async t=>{
 const f=await fixture(t);const before=await readFile(join(f.data,'top.json'),'utf8');
 for(const id of ['unknown','../../outside']){const result=f.run({CONTENT_AUTOMATIC:'0',MATCH:id});assert.notEqual(result.status,0);assert.equal(await readFile(join(f.data,'top.json'),'utf8'),before);}
});
test('manual expanded top uses the frozen editorial cut instead of a second independent ranking',async t=>{
 const f=await fixture(t);const result=f.run({CONTENT_AUTOMATIC:'0',TOP:'7',SCRIPT_TOP_N:'5'});assert.equal(result.status,0,result.stderr);
 const selected=await readContentSelection({repo:f.repo,env:{CONTENT_SELECTION_FILE:'.cache/content-selection.json'}});
 assert.deepEqual(contentMatches(selected.top,selected.fixtures.matches).map(m=>m.webId),f.matches.slice(0,7).map(m=>m.webId));
});
test('scoped workflow validators ignore unrelated corrupt scripts, prompts and media; global CI still catches them',async t=>{
 const f=await fixture(t);await writeFile(join(f.data,'evaluation-report.json'),'{"published":false}');
 await mkdir(join(f.repo,'.cache'));await writeFile(join(f.repo,'.cache/empty.json'),'{"ids":[]}');
 for(const category of ['youtube-scripts','media-pack','image-prompts']){await mkdir(join(f.data,category));await writeFile(join(f.data,category,'unrelated.json'),'{broken');}
 for(const script of ['check-compliance.mjs','check-match-prompts.mjs']){
  const scoped=spawnSync(process.execPath,[resolve('scripts',script),'--selection=.cache/empty.json'],{cwd:f.repo,encoding:'utf8'});assert.equal(scoped.status,0,scoped.stderr);
  const all=spawnSync(process.execPath,[resolve('scripts',script)],{cwd:f.repo,encoding:'utf8'});assert.notEqual(all.status,0);
 }
});
