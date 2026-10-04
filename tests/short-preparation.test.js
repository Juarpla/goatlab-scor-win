import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planEdit, prepareShort } from '../fly/render/short-job.mjs';

test('provider failure replaces a stale plan with a validated local montage', async t => {
  const tmp = mkdtempSync(join(tmpdir(), 'goatlab-plan-'));
  const key = process.env.OPENCODE_GO_API_KEY;
  process.env.OPENCODE_GO_API_KEY = '';
  t.after(() => { rmSync(tmp, { recursive: true, force: true }); if (key === undefined) delete process.env.OPENCODE_GO_API_KEY; else process.env.OPENCODE_GO_API_KEY = key; });
  writeFileSync(join(tmp, 'edit-input.json'), '{}');
  writeFileSync(join(tmp, 'edit-plan.json'), JSON.stringify({ stale: true }));
  const source = { span: 6, words: [{ word: 'Hola', start: .5, end: 1 }], assets: [] };
  const plan=await planEdit(source,tmp);
  assert.equal(plan.model,'local-montage');assert.equal(plan.fallback,true);
  assert.equal(plan.scenes.at(-1).end,source.span);
  assert.ok(plan.scenes.every(s=>!s.layers.length && s.graphics.length));
  assert.deepEqual(await planEdit(source,tmp),plan);
});

test('empty cached transcription cannot produce a video without subtitles', async t => {
  const tmp = mkdtempSync(join(tmpdir(), 'goatlab-transcript-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  writeFileSync(join(tmp, 'transcript.json'), JSON.stringify({ words: [] }));
  let planned = false;
  await assert.rejects(prepareShort({ tmp, voiceSeconds: 6, planner: () => { planned = true; } }), /transcripción vacía/);
  assert.equal(planned, false);
});
