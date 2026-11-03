// Local render: media-pack + voice -> 1080x1920 MP4 via the configured renderer.
// Usage: node --env-file=.env video-render/cli/render.mjs --match=<webId> [--audio=<file>] --plan=plan.json [--script=scripts.json --script-n=N] [--variant=N] [--out=output.mp4]
// The audio defaults to the single file in video-render/audios/<match>/.
// Requires Node 22, ffmpeg, ffprobe and `npm ci` in video-render/render/remotion.
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { narrationText } from '../contract/narration.js';
import { FPS, FRAME_H, FRAME_W, MAX_SECONDS } from '../contract/short-format.js';
import {
  assertAudioInput,
  assertMatchId,
  assertVideoOutput,
  audioFiles,
  matchAudioDir,
  matchRecipeDir,
  matchVideoDir,
  videoName,
} from '../contract/layout.js';
import {
  alignReference,
  alignScripts,
  mediaDuration,
  muxVoice,
  prepareShort,
  renderSilent,
  transcribeWords,
} from '../pipeline/index.mjs';

const run = promisify(execFile);
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../..');

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

if (!args.match) fail('falta --match=<webId>');
let match;
try { match = assertMatchId(args.match); } catch (e) { fail(e.message); }
const variant = Number(args.variant ?? 0);
if (!Number.isInteger(variant) || variant < 0) fail('--variant must be a non-negative integer');
if (!args.plan || !existsSync(args.plan)) fail('falta --plan=<plan JSON aprobado por OpenClaw>');

function pickAudio(dir) {
  const files = audioFiles(dir);
  if (files.length === 1) return join(dir, files[0]);
  if (!files.length) fail(`deja el audio en ${dir} o pasa --audio=<archivo>`);
  fail(`hay ${files.length} audios en ${dir}; elige uno con --audio=<archivo>`);
}

if (!(await has('ffmpeg'))) fail('ffmpeg no está en PATH');
if (!(await has('ffprobe'))) fail('ffprobe no está en PATH');

const load = (p) => {
  if (!existsSync(p)) fail(`falta ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
};
const media = load(join(ROOT, 'public/data/media-pack', `${match}.json`));
const assets = Array.isArray(media.assets) ? media.assets : [];
if (assets.some(asset => asset.source !== 'agnes')) fail('Solo se admiten recursos Agnes');

const audioDir = matchAudioDir(ROOT, match);
mkdirSync(audioDir, { recursive: true });
let audio;
try {
  audio = args.audio ? assertAudioInput(ROOT, args.audio, match) : pickAudio(audioDir);
} catch (e) {
  fail(e.message);
}
if (!existsSync(audio)) fail(`audio no existe: ${audio}`);

// The script is optional: if passed, it fixes names and figures Mistral
// confuses, preserving its word timings.
let reference = '', scriptCandidates = null, alignment = null;
if (args.script) {
  const document = load(args.script);
  if (args['script-n']) {
    const script = (document.scripts ?? []).find(item => item?.n === Number(args['script-n']));
    if (!narrationText(script?.narration)) fail(`guion ${args['script-n']} no encontrado en ${args.script}`);
    reference = narrationText(script.narration);
  } else {
    scriptCandidates = (document.scripts ?? []).filter(item => narrationText(item?.narration));
    if (!scriptCandidates.length) fail(`no hay guiones con narración en ${args.script}`);
  }
}

let out;
try {
  out = args.out
    ? assertVideoOutput(ROOT, args.out, match)
    : join(matchVideoDir(ROOT, match), videoName(match, audio, variant));
} catch (e) {
  fail(e.message);
}
mkdirSync(dirname(out), { recursive: true });
const recipes = matchRecipeDir(ROOT, match);
mkdirSync(recipes, { recursive: true });
const stem = basename(out, '.mp4');
const recipePlan = join(recipes, `${stem}.plan.json`);
if (resolve(args.plan) !== resolve(recipePlan)) cpSync(args.plan, recipePlan);

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
  const plan = load(args.plan);
  const voiceSeconds = await mediaDuration(voiceFile);
  const { total, provider, errors, voiceFile: adjustedVoiceFile } = await prepareShort({
    tmp,
    voiceFile,
    voiceSeconds,
    assets, clips: media.clips ?? [], facts: media.facts ?? [],
    variant, plan,
    home: media.home ?? '',
    away: media.away ?? '',
    matchLabel: media.match,
    log: (m) => console.log(`render: ${m}`),
    transcriber: (reference || scriptCandidates) ? scriptTimes : undefined,
  });
  lap(`preparado (tiempos ${provider}${errors.length ? `; ${errors.join(' | ')}` : ''})`);
  const silent = join(tmp, 'silent.mp4');
  await renderSilent(tmp, silent);
  lap('render');
  const finalOut = join(tmp, 'with-audio.mp4');
  await muxVoice({ silent, voiceFile: adjustedVoiceFile, total, out: finalOut, music: plan.version === 5 ? plan.music === true : true });
  cpSync(finalOut, out);
  const manifestPath = join(recipes, 'manifest.json');
  let manifest = {};
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch {}
  manifest[basename(out)] = { match, audio: relative(ROOT, audio), plan: relative(ROOT, recipePlan), script: args.script ?? null,
    scriptN: alignment?.script ?? null, score: alignment?.score ?? null, variant,
    out: relative(ROOT, out),
    duration: Number(total.toFixed(3)), bytes: statSync(out).size, at: new Date().toISOString() };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  if (args.keep) cpSync(join(tmp, 'composition.json'), join(recipes, `${stem}.composition.json`));
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
