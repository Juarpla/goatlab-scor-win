// One-time legacy fact migration; future snapshots use fixtures independently.
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {contentMatches} from '../src/lib/content-store.js';
import {productionContext} from '../src/lib/production-context.js';
mkdirSync('public/data/production-context',{recursive:true});
let count=0;
for(const match of contentMatches()) {
 const path=`public/data/production-context/${match.matchId}.json`;
 let context=productionContext(match,{publication:'ready'});
 if(!context.facts.length) {
  if(existsSync(path))continue;
  const legacy=`public/data/motion-prompts/${match.matchId}.json`;
  if(!existsSync(legacy))continue;
  const raw=readFileSync(legacy,'utf8'),data=JSON.parse(raw);
  context.facts=(data.facts??[]).filter(f=>f.source&&f.unit&&Number.isFinite(f.value)&&f.value>=0);
  if(!context.facts.length)continue;
  context.provenance={source:'legacy-fact-snapshot',generatedAt:data.generatedAt??null,migratedFrom:legacy,sourceHash:createHash('sha256').update(raw).digest('hex')};
 }
 delete context.hash;
 context.hash=createHash('sha256').update(JSON.stringify(context)).digest('hex');
 writeFileSync(path,JSON.stringify(context,null,2)+'\n');count++;
}
console.log(`Contextos independientes guardados: ${count}`);
