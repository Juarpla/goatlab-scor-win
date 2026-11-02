// Render local: media-pack + voz -> MP4 1080x1920 vía Remotion.
// Uso: node --env-file=.env scripts/render-short.mjs --match=<webId> --audio=voz.ogg --plan=plan.json [--script=guiones.json --script-n=N] [--variant=N] [--out=salida.mp4]
// Mismo camino que el worker: tiempos por palabra (Mistral, whisper.cpp),
// fotos reducidas, plan local y voz mezclada. Requiere Node 22, ffmpeg,
// ffprobe y `npm install` en video-render/render/remotion (Remotion + React).
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, cpSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { FRAME_W, FRAME_H, FPS, MAX_SECONDS } from '../src/lib/short-format.js';
import { prepareShort, renderSilent, muxVoice, mediaDuration } from '../video-render/engine/short-job.mjs';
import { transcribeWords } from '../video-render/engine/transcribe.mjs';
import { alignReference, alignScripts } from '../video-render/engine/reference-timing.mjs';

const run = promisify(execFile);
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }),
);

const fail = (msg) => {
  console.error(`render: ${msg}`);
  process.exit(1);
};

async function has(bin) {
  try {
    await run(process.platform === 'win32' ? 'where' : 'which', [bin]);
    return true;
  } catch {
    return false;
  }
}

const match = args.match ?? fail('falta --match=<webId>');
const audio = args.audio ?? fail('falta --audio=<voz> (los tiempos de cada palabra salen de la voz)');
if (!existsSync(audio)) fail(`audio no existe: ${audio}`);
const variant = Number(args.variant ?? 0);
if (!args.plan || !existsSync(args.plan)) fail('falta --plan=<plan JSON aprobado por OpenClaw>');

if (!(await has('ffmpeg'))) fail('ffmpeg no está en PATH');
if (!(await has('ffprobe'))) fail('ffprobe no está en PATH');

const load = (p) => {
  if (!existsSync(p)) fail(`falta ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
};
const media = load(join(ROOT, 'public/data/media-pack', `${match}.json`));
const assets = Array.isArray(media.assets) ? media.assets : [];
if (assets.some(asset => asset.source !== 'agnes')) fail('Solo se admiten recursos Agnes');

// El guion es opcional: si se pasa, corrige los nombres y cifras que Mistral
// confunde, conservando sus tiempos por palabra.
let reference = '', scriptCandidates = null, alignment = null;
if (args.script) {
  const document = load(args.script);
  if (args['script-n']) {
    const script = (document.scripts ?? []).find(item => item?.n === Number(args['script-n']));
    if (!script?.narration) fail(`guion ${args['script-n']} no encontrado en ${args.script}`);
    reference = script.narration;
  } else {
    scriptCandidates = (document.scripts ?? []).filter(item => item?.narration);
    if (!scriptCandidates.length) fail(`no hay guiones con narración en ${args.script}`);
  }
}

const out = args.out ?? join(ROOT, 'video-render/videos', `${match}-v${variant}.mp4`);
mkdirSync(dirname(out), { recursive: true });

const tmp = join(tmpdir(), `goatlab-short-${match}-v${variant}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const voiceFile = join(tmp, `voice-in${audio.match(/\.[^.]+$/)?.[0] ?? '.ogg'}`);
cpSync(audio, voiceFile);

const started = Date.now();
const lap = (label) => console.log(`render: ${label} ${((Date.now() - started) / 1000).toFixed(1)}s`);

async function scriptTimes({ tmp, voiceFile, voiceSeconds, log }) {
  const flac = join(tmp, 'voice16k.flac');
  const wav = join(tmp, 'voice16k.wav');
  await Promise.all([
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voiceFile, '-ac', '1', '-ar', '16000', flac]),
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voiceFile, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]),
  ]);
  const { provider, words, errors } = await transcribeWords({ flac, wav, voiceSeconds, log });
  if (!words.length) throw new Error('No se pudo transcribir el audio.');
  const aligned = reference ? alignReference(words, reference, voiceSeconds) : alignScripts(words, scriptCandidates, voiceSeconds);
  if (!aligned) throw new Error('No hay guiones para alinear.');
  alignment = { script: aligned.n ?? Number(args['script-n']), score: aligned.score };
  log(`guion: ${args['script-n'] ? '' : `script ${aligned.n}, `}${Math.round(aligned.score * 100)}% de coincidencia; ${aligned.words.length} palabras`);
  return { provider: `${provider}+guion`, words: aligned.score >= .5 ? aligned.words : words, heard: words, errors };
}

try {
  const voiceSeconds = await mediaDuration(voiceFile);
  const { total, provider, errors, voiceFile: adjustedVoiceFile } = await prepareShort({
    tmp,
    voiceFile,
    voiceSeconds,
    assets, clips: media.clips ?? [], facts: media.facts ?? [],
    variant, plan: load(args.plan),
    home: media.home ?? '',
    away: media.away ?? '',
    matchLabel: media.match,
    log: (m) => console.log(`render: ${m}`),
    transcriber: (reference || scriptCandidates) ? scriptTimes : undefined,
  });
  lap(`preparado (tiempos ${provider}${errors.length ? `; ${errors.join(' | ')}` : ''})`);
  const silent = join(tmp, 'silent.mp4');
  await renderSilent(tmp, silent);
  lap('remotion');
  const finalOut = join(tmp, 'with-audio.mp4');
  await muxVoice({ silent, voiceFile: adjustedVoiceFile, total, out: finalOut, music: load(args.plan).version === 5 ? load(args.plan).music === true : true });
  cpSync(finalOut, out);
  const manifestPath = join(dirname(out), 'manifest.json');
  let manifest = {};
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch {}
  manifest[basename(out)] = { match, audio, plan: args.plan ?? null, script: args.script ?? null,
    scriptN: alignment?.script ?? null, score: alignment?.score ?? null, variant,
    duration: Number(total.toFixed(3)), bytes: statSync(out).size, at: new Date().toISOString() };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  if (args.keep) cpSync(join(tmp, 'composition.json'), out.replace(/\.mp4$/, '.json'));
} catch (e) {
  fail(e.message);
}

const probe = JSON.parse(
  (await run('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', out])).stdout,
);
const v = probe.streams.find((s) => s.codec_type === 'video');
if (!v || v.width !== FRAME_W || v.height !== FRAME_H) fail(`video inesperado: ${v?.width}x${v?.height}`);
const [num, den] = v.r_frame_rate.split('/').map(Number);
if (v.codec_name !== 'h264' || Math.abs(num / den - FPS) > .01 || !probe.streams.some(s => s.codec_type === 'audio' && s.codec_name === 'aac') || Number(probe.format.duration) > MAX_SECONDS || statSync(out).size >= 45_000_000) fail('MP4 fuera del contrato de formato, duración o tamaño');
rmSync(tmp, { recursive: true, force: true });
lap(`listo ${out} (${v.width}x${v.height}, variante ${variant})`);
