import { readFileSync, writeFileSync, readdirSync, cpSync } from 'node:fs';
const names = ['youtube', 'media', 'teams', 'compliance', 'agnes', 'team-colors', 'match-facts', 'media-progress', 'match-content', 'motion-system', 'top', 'r2-signed', 'r2-state-config', 'agnes-state', 'agnes-reports', 'pruning', 'media-contract', 'media-diagnostics', 'media-reader'];
for (const name of names) {
  const source = new URL(`../src/lib/${name}.js`, import.meta.url);
  const target = new URL(`../fly/gateway/workspace/skills/goatlab/lib/${name}.js`, import.meta.url);
  const content = readFileSync(source, 'utf8');
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw new Error(`skill desactualizado: ${name}`);
  } else writeFileSync(target, content);
}

const cinemaSource = readFileSync(new URL("../src/lib/cinema-catalog.json",import.meta.url),"utf8");
const cinemaTarget = new URL("../fly/gateway/workspace/skills/goatlab/references/cinema-catalog.json",import.meta.url);
if(process.argv.includes("--check")){if(readFileSync(cinemaTarget,"utf8")!==cinemaSource)throw new Error("catálogo cinematográfico desactualizado");}else writeFileSync(cinemaTarget,cinemaSource);

const upstream = new URL('../.agents/skills/remotion-best-practices/',import.meta.url);
const deployed = new URL('../fly/gateway/workspace/skills/remotion-best-practices/',import.meta.url);
function checkTree(source,target) {
  for(const entry of readdirSync(source,{withFileTypes:true})) {
    const a=new URL(entry.name+(entry.isDirectory()?'/':''),source),b=new URL(entry.name+(entry.isDirectory()?'/':''),target);
    if(entry.isDirectory())checkTree(a,b);
    else if(!readFileSync(a).equals(readFileSync(b)))throw new Error('skill Remotion desactualizado: '+entry.name);
  }
}
if(process.argv.includes('--check'))checkTree(upstream,deployed);else cpSync(upstream,deployed,{recursive:true});
