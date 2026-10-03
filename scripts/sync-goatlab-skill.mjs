import { readFileSync, writeFileSync } from 'node:fs';
const names = ['youtube', 'media', 'teams', 'compliance', 'agnes', 'team-colors', 'match-facts', 'media-progress'];
for (const name of names) {
  const source = new URL(`../src/lib/${name}.js`, import.meta.url);
  const target = new URL(`../fly/gateway/workspace/skills/goatlab/lib/${name}.js`, import.meta.url);
  const content = readFileSync(source, 'utf8');
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw new Error(`skill desactualizado: ${name}`);
  } else writeFileSync(target, content);
}
