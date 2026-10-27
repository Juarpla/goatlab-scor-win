import { readFileSync, writeFileSync } from 'node:fs';
const names = ['media-policy', 'content-selection', 'visual-style', 'youtube', 'media', 'teams', 'compliance', 'agnes', 'team-colors', 'match-facts', 'media-progress', 'match-content', 'top', 'r2-signed', 'r2-state-config', 'agnes-state', 'agnes-reports', 'pruning', 'media-contract', 'media-diagnostics', 'media-reader'];
for (const file of [...names.map(name => name + '.js'), 'video-animation.json', 'montage-experiment.json']) {
  const source = new URL(`../src/lib/${file}`, import.meta.url);
  const target = new URL(`../fly/gateway/workspace/skills/goatlab/lib/${file}`, import.meta.url);
  const content = readFileSync(source, 'utf8');
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw new Error(`skill desactualizado: ${file}`);
  } else writeFileSync(target, content);
}
