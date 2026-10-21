import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { composeShort, prepareShort } from '../fly/render/short-job.mjs';

test('Render requires a director plan and cannot replace it with an automatic montage', t => {
  const tmp = mkdtempSync(join(tmpdir(), 'goatlab-plan-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  writeFileSync(join(tmp, 'prepared.json'), JSON.stringify({ frames:270, photos:[], clips:[], words:[{word:'Hola',start:.5,end:1}] }));
  assert.throws(() => composeShort(tmp, undefined), /plan de edición/);
  assert.equal(existsSync(join(tmp, 'composition.json')), false);
  const plan = {version:4, scenes:[{start:0,end:6,layers:[],graphics:[]}]};
  assert.deepEqual(composeShort(tmp, plan).plan, plan);
});

test('empty cached transcription cannot produce a video without subtitles', async t => {
  const tmp = mkdtempSync(join(tmpdir(), 'goatlab-transcript-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  writeFileSync(join(tmp, 'transcript.json'), JSON.stringify({ words: [] }));
  await assert.rejects(prepareShort({ tmp, voiceSeconds: 6 }), /transcripción vacía/);
  assert.equal(existsSync(join(tmp,'composition.json')), false);
});
