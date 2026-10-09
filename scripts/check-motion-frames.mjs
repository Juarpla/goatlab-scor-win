/** QA cinematográfico capa 1 (determinístico, sin IA): valida el sistema carbon-v1 por partido
 * y emite el manifiesto de frames para la capa 2 (visión OpenClaw: hero + 1 azar).
 * Uso: node scripts/check-motion-frames.mjs [--match=<id>] */
import { readFile, readdir } from 'node:fs/promises';
import { MOTION_SYSTEM } from '../src/lib/motion-system.js';
import { promptErrors } from '../src/lib/match-content.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const onlyMatch = args.match ?? null;
const files = (await readdir('public/data/motion-prompts')).filter(f => f.endsWith('.json') && (!onlyMatch || f === `${onlyMatch}.json`));
let failed = 0;
const manifest = [];
for (const file of files) {
  const matchId = file.replace(/\.json$/, '');
  const data = JSON.parse(await readFile(`public/data/motion-prompts/${file}`, 'utf8'));
  const errors = promptErrors(data, { published: data.published === true });
  const sigs = [...new Set(data.prompts.map(p => p.signature_move).filter(Boolean))];
  if (sigs.length > 5) errors.push(`${matchId}: más de 5 signature moves en el banco (${sigs.join(', ')})`);
  const unknown = sigs.filter(m => !MOTION_SYSTEM.signatureMoves.includes(m));
  if (unknown.length) errors.push(`${matchId}: signature moves desconocidos: ${unknown.join(', ')}`);
  const noRationale = data.prompts.filter(p => !p.design_rationale).length;
  if (noRationale) errors.push(`${matchId}: ${noRationale} prompts sin design_rationale`);
  // Manifiesto de frames para visión: por prompt, settled (fin de build) + mid (mitad de main).
  for (const row of data.prompts) {
    const beats = Array.isArray(row.beats) ? row.beats : [];
    const build = beats.find(b => b.action === 'build'), main = beats.find(b => b.action === 'main');
    manifest.push({ matchId, n: row.n, kind: row.kind, signature_move: row.signature_move ?? null,
      stills: { settled: build ? build.t1 : null, mid: main ? (main.t0 + main.t1) / 2 : null } });
  }
  if (errors.length) { failed++; console.error(`${matchId}: ${errors.slice(0, 6).join('; ')}`); }
  else console.log(`${matchId}: QA ok (${data.prompts.length} prompts, ${sigs.length} signatures)`);
}
await import('node:fs/promises').then(fs => fs.writeFile('public/data/motion-qa-manifest.json', JSON.stringify({ updatedAt: new Date().toISOString(), frames: manifest }, null, 2)));
console.log(`manifiesto: ${manifest.length} prompts`);
process.exitCode = failed ? 1 : 0;
