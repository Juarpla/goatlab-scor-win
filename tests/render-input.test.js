import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyRenderInput, benchmarkSchedule } from '../video-render/bench/render-input.mjs';
import { imageDimensions, normalizedDimensions, photoProfile } from '../video-render/pipeline/04-photo-normalize.mjs';
import { cameraAt, grainPosition } from '../video-render/render/remotion/kit/kit-logic.mjs';

function directory(t) { const dir = mkdtempSync(join(tmpdir(), 'goatlab-render-input-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }
function writeInput(dir) {
  mkdirSync(dir, { recursive: true });
  const props = { frames: 90, font: 'font.ttf', brand: 'brand.svg', photos: [{ src: 'photo.jpg', backdrop: 'back.jpg', focusBlur: 'focus.jpg', width: 1472, height: 2624 }], clips: [{ src: 'clip.mp4' }], plan: { version: 5, code: 'export default () => null' } };
  for (const name of ['font.ttf', 'brand.svg', 'photo.jpg', 'back.jpg', 'focus.jpg', 'clip.mp4', 'voice.ogg', 'candidate-1.mp4']) writeFileSync(join(dir, name), 'test-' + name);
  writeFileSync(join(dir, 'composition.json'), JSON.stringify(props));
  writeFileSync(join(dir, 'prepared.json'), JSON.stringify({ voiceFile: join(dir, 'voice.ogg') }));
  return props;
}

test('real benchmark copies change photo pixels and metadata without modifying originals', async t => {
  const root = directory(t), source = join(root, 'source'), target = join(root, 'resized');
  writeInput(source);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1472x2624', '-frames:v', '1', join(source, 'photo.jpg')]);
  const before = new Map(readdirSync(source).map(name => [name, readFileSync(join(source, name))]));
  const result = await copyRenderInput(source, target, { photoMax: 1080 });
  const expected = normalizedDimensions({ width: 1472, height: 2624 }, photoProfile(1080));
  assert.deepEqual(await imageDimensions(join(target, 'photo.jpg')), expected);
  assert.equal(result.photos[0].width, expected.width); assert.equal(result.photos[0].height, expected.height);
  assert.notDeepEqual(readFileSync(join(target, 'photo.jpg')), before.get('photo.jpg'));
  assert.deepEqual(readdirSync(source), [...before.keys()]);
  for (const [name, bytes] of before) assert.deepEqual(readFileSync(join(source, name)), bytes);
  assert.deepEqual(readFileSync(join(target, 'clip.mp4')), before.get('clip.mp4'));
  assert.deepEqual(normalizedDimensions({ width: 320, height: 180 }, photoProfile(1080)), { width: 320, height: 180 });
  const props = JSON.parse(readFileSync(join(source, 'composition.json'))); props.font = '../private.ttf';
  writeFileSync(join(source, 'composition.json'), JSON.stringify(props));
  await assert.rejects(copyRenderInput(source, join(root, 'unsafe')), /archivo local/);
});

test('benchmark separates one cold bundle per condition and alternates three warm repetitions', () => {
  const configs = [1472, 1280, 1080].map(photoMax => ({ photoMax, workers: 2, gl: 'default' }));
  const schedule = benchmarkSchedule(configs, 3);
  assert.equal(schedule.filter(row => row.phase === 'cold-bundle').length, 3);
  assert.equal(schedule.filter(row => row.phase === 'warm-bundle').length, 9);
  assert.notDeepEqual(schedule.filter(r => r.run === 1).map(r => r.photoMax), schedule.filter(r => r.run === 2).map(r => r.photoMax));
});

test('camera clamps to scene boundaries and grain is deterministic without per-frame random pixels', () => {
  const config = { from: { scale: 1, x: -20, y: 10 }, to: { scale: 1.1, x: 20, y: -10 }, durationInFrames: 31, startFrame: 10 };
  assert.deepEqual(cameraAt(0, config), config.from);
  assert.deepEqual(cameraAt(25, config), { scale: 1.05, x: 0, y: 0 });
  assert.deepEqual(cameraAt(100, config), config.to);
  assert.deepEqual(grainPosition(0, 2), grainPosition(1, 2));
  assert.notDeepEqual(grainPosition(1, 2), grainPosition(2, 2));
  assert.deepEqual(grainPosition(19, 2), grainPosition(19, 2));
});
