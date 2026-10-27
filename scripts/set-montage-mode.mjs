/** Switch the experiment and its transportable copy without touching Agnes or R2. */
import { readFileSync, writeFileSync } from 'node:fs';
import { mediaPolicy } from '../src/lib/media-policy.js';
const mode = process.argv[2];
if (!['freedom', 'clips-first'].includes(mode)) throw new Error('Uso: node scripts/set-montage-mode.mjs freedom|clips-first');
const source = new URL('../src/lib/montage-experiment.json', import.meta.url);
const config = { ...JSON.parse(readFileSync(source, 'utf8')), mode };
mediaPolicy('', config);
const text = JSON.stringify(config, null, 2) + '\n';
writeFileSync(source, text);
writeFileSync(new URL('../fly/gateway/workspace/skills/goatlab/lib/montage-experiment.json', import.meta.url), text);
console.log(`Modo ${mode} guardado. Publica el commit y despliega Gateway para aplicarlo en producción.`);
