import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { bedPath, muxVoice, voiceBedGraph } from '../fly/render/short-job.mjs';

const run = promisify(execFile);

test('el filtro baja la cama y no parte la voz', () => {
  const graph = voiceBedGraph(18.5);
  assert.match(graph, /volume=-18dB/);
  assert.match(graph, /normalize=0/);
  assert.match(graph, /atrim=0:18\.5/);
  assert.match(graph, /\[voice\]\[bed\]amix=inputs=2/);
});

test('sin el mp3 el render no sigue', async () => {
  await assert.rejects(
    () => muxVoice({ silent: 'x', voiceFile: 'y', total: 8, out: 'z', bedFile: join(tmpdir(), 'no-bed-goatlab.mp3') }),
    /falta la música de fondo/,
  );
});

function loudness(stderr) {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  return Number(JSON.parse(stderr.slice(start, end + 1)).input_i);
}

test('la cama no sube el loudness de la voz más de 1 LU', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'goatlab-bed-'));
  const silent = join(dir, 'silent.mp4');
  const voice = join(dir, 'voice.wav');
  const mixed = join(dir, 'mixed.mp4');
  const voiceOnly = join(dir, 'voice.m4a');
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', silent]);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8:sample_rate=44100', voice]);
    await muxVoice({ silent, voiceFile: voice, total: 8, out: mixed, bedFile: bedPath() });
    await run('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', voice,
      '-af', 'aresample=44100,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=0:8',
      voiceOnly,
    ]);
    const mixedProbe = await run('ffmpeg', ['-i', mixed, '-af', 'loudnorm=print_format=json', '-f', 'null', '-']);
    const voiceProbe = await run('ffmpeg', ['-i', voiceOnly, '-af', 'loudnorm=print_format=json', '-f', 'null', '-']);
    const delta = loudness(mixedProbe.stderr) - loudness(voiceProbe.stderr);
    assert.ok(Math.abs(delta) < 1, `delta ${delta.toFixed(2)} LU`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
