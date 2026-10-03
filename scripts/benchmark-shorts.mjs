// Offline technical fixture; timings are synthetic, never used in production.
// node scripts/benchmark-shorts.mjs [--out=/absolute/directory] [--runs=3]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { mkdirSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { buildComposition, FONT_FILE } from '../src/lib/hyperframe.js';
import { buildPlannedComposition } from '../src/lib/edit-plan.js';
import { renderSilent, muxVoice, SKILL_ROOT } from '../fly/render/short-job.mjs';
const run = promisify(execFile);
const require = createRequire(new URL('../fly/render/package.json', import.meta.url));
const sharp = require('sharp');
const options = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const out = resolve(options.out || '.cache/shorts-review');
const repetitions = Number(options.runs || 3);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) throw new Error('runs: 1–10');
mkdirSync(out, { recursive: true });
const words = 'Dos equipos tres ocasiones una decisión El espacio cambia el partido'.split(' ').map((word, i) => ({ word, start: .5 + i * .45, end: .5 + (i + 1) * .45 }));
const duration = 9;
const photos = [0, 1].map(i => ({ src: `${i}.jpg`, width: 1472, height: 2624 }));
// SVG assets explicitly depict a tactical board, without fictitious players or match facts.
for (let i = 0; i < 2; i++) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1472" height="2624"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${i ? '#152d51' : '#183b2c'}"/><stop offset="1" stop-color="#080e13"/></linearGradient></defs><rect width="1472" height="2624" fill="url(#g)"/><g fill="none" stroke="#b4d4c4" opacity=".35" stroke-width="9"><rect x="130" y="420" width="1212" height="1740"/><path d="M130 1290H1342"/><circle cx="736" cy="1290" r="210"/><rect x="480" y="420" width="512" height="280"/><rect x="480" y="1880" width="512" height="280"/></g>${[0,1,2,3,4,5].map(n=>`<circle cx="${280+(n%3)*390}" cy="${900+Math.floor(n/3)*700+i*100}" r="58" fill="${i ? '#f6cb5b' : '#c5ed74'}"/>`).join('')}<text x="130" y="280" fill="white" font-family="sans-serif" font-size="57">GOATLAB · PRUEBA TÉCNICA</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(join(out, `${i}.jpg`));
}
await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=6', '-af', 'volume=0.04', join(out, 'voice.wav')]);
const plan = { version: 1, model: 'offline-fixture', scenes: [
  { start: 0, end: 3, transition: 'cut', accent: '#c5ed74', layers: [{ asset: 0, move: 'push' }], graphics: [{ kind: 'label', at: .5, duration: 2.2, wordStart: 0, wordEnd: 2 }] },
  { start: 3, end: 6, transition: 'wipe', accent: '#f6cb5b', layers: [
    { asset: 0, move: 'pan-left', box: { x: 0, y: 0, w: .5, h: 1 } },
    { asset: 1, move: 'rise', box: { x: .5, y: 0, w: .5, h: 1 } }], graphics: [{ kind: 'line', at: 3, duration: 2 }] }
] };
writeFileSync(join(out, 'fixture.json'), JSON.stringify({ duration, photos, words, plan }, null, 2));
const results = [];
for (let repetition = 0; repetition < repetitions; repetition++) {
  // Alternate order to reduce systematic warm-up bias.
  for (const kind of repetition % 2 ? ['planned', 'legacy'] : ['legacy', 'planned']) {
    const directory = join(out, kind); mkdirSync(directory, { recursive: true });
    for (const photo of photos) copyFileSync(join(out, photo.src), join(directory, photo.src));
    copyFileSync(resolve('fly/render/assets', FONT_FILE), join(directory, FONT_FILE));
    copyFileSync(join(SKILL_ROOT, 'assets/brand.svg'), join(directory, 'brand.svg'));
    copyFileSync(resolve('fly/render/node_modules/gsap/dist/gsap.min.js'), join(directory, 'gsap.min.js'));
    writeFileSync(join(directory, 'index.html'), (kind === 'planned' ? buildPlannedComposition : buildComposition)({ duration, photos, words, plan, match: 'Muestra técnica' }));
    const silent = join(directory, 'silent.mp4');
    const started = performance.now();
    await renderSilent(directory, silent, { workers: 1 });
    const captureMs = performance.now() - started;
    await muxVoice({ silent, voiceFile: join(out, 'voice.wav'), total: duration, out: join(directory, 'short.mp4') });
    const { stdout } = await run('ffprobe', ['-v', 'quiet', '-show_streams', '-show_format', '-of', 'json', join(directory, 'short.mp4')]);
    const probe = JSON.parse(stdout), video = probe.streams.find(s => s.codec_type === 'video');
    const audio = probe.streams.find(s => s.codec_type === 'audio');
    if (video.width !== 1080 || video.height !== 1920 || video.avg_frame_rate !== '30/1' || audio.codec_name !== 'aac') throw new Error('formato incorrecto');
    const sizeMb = statSync(join(directory, 'short.mp4')).size / 1024 ** 2;
    if (sizeMb >= 45) throw new Error('límite de peso');
    results.push({ repetition, kind, captureMs: Math.round(captureMs), totalMs: Math.round(performance.now() - started), sizeMb, videoSeconds: Number(probe.format.duration) });
    console.log(JSON.stringify(results.at(-1)));
    writeFileSync(join(out, 'benchmark.json'), JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, workers: 1, syntheticAudio: true, includesNetworkOrModels: false, results }, null, 2));
  }
}
