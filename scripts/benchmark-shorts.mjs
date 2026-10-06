// Benchmark a saved composition using the production Remotion path.
import { renderSilent } from '../fly/render/short-job.mjs';
import { resolve, join } from 'node:path';
const input = process.argv.find(a => a.startsWith('--input='))?.slice(8);
if (!input) throw new Error('falta --input=<carpeta con composition.json y medios>');
const runs = Math.min(5, Math.max(1, Number(process.argv.find(a=>a.startsWith('--runs='))?.slice(7) || 3)));
for (let i=0; i<runs; i++) {
  const at=Date.now(); await renderSilent(resolve(input), join(resolve(input), `benchmark-${i}.mp4`));
  console.log(JSON.stringify({run:i+1, engine:'remotion', seconds:(Date.now()-at)/1000}));
}
