// Controlled A/B tool check, with the same media/text and one effect at a time.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { copyRenderInput, benchmarkSchedule } from '../fly/render/render-input.mjs';
import { renderSilent } from '../fly/render/short-job.mjs';

const flag = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
if (!flag('input') || !flag('output-dir')) throw new Error('requiere --input=<composición> y --output-dir=<comparaciones>');
const source = resolve(flag('input')), output = resolve(flag('output-dir'));
if (output === source || output.startsWith(source + sep)) throw new Error('output-dir debe estar fuera del original');
const runs = Number(flag('runs') || 3), workers = Number(flag('workers') || 2);
if (!Number.isInteger(runs) || runs < 1 || runs > 5) throw new Error('runs requiere 1–5 repeticiones calientes');
if (!Number.isInteger(workers) || workers < 1) throw new Error('workers requiere un entero positivo');
const piece = readFileSync(new URL('./bench/cinema-piece.jsx', import.meta.url), 'utf8');
const root = mkdtempSync(join(tmpdir(), 'goatlab-kit-ab-'));
const cases = ['baseline', 'camera', 'wash', 'grain'].map(effect => ({ effect }));
mkdirSync(output, { recursive: true });
const rows = [];
try {
  for (const { effect } of cases) {
    const dir = join(root, effect), props = await copyRenderInput(source, dir);
    props.frames = 210; props.contentFrames = 180;
    props.plan = { version: 5, visualStyle: 'documentary', scenes: [{ start: 0, end: 6 }], music: false,
      code: piece.replaceAll('CAMERA_ENABLED', String(effect === 'camera')).replaceAll('WASH_ENABLED', String(effect === 'wash')).replaceAll('GRAIN_ENABLED', String(effect === 'grain')) };
    writeFileSync(join(dir, 'composition.json'), JSON.stringify(props));
  }
  for (const config of benchmarkSchedule(cases, runs)) {
    const out = join(output, `${config.effect}.mp4`);
    const metrics = await renderSilent(join(root, config.effect), out, { workers });
    const row = { ...config, syntheticComposition: true, mediaSource: source, video: out, ...metrics };
    rows.push(row); console.log(JSON.stringify(row));
    writeFileSync(join(output, 'metrics.json'), JSON.stringify(rows, null, 2));
  }
} finally { rmSync(root, { recursive: true, force: true }); }
