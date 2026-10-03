import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planEdit, prepareShort } from '../fly/render/short-job.mjs';

test('a failed replanning invalidates the previous plan across later retries', async t => {
  const tmp = mkdtempSync(join(tmpdir(), 'goatlab-plan-'));
  const key = process.env.OPENCODE_GO_API_KEY;
  process.env.OPENCODE_GO_API_KEY = '';
  t.after(() => { rmSync(tmp, { recursive: true, force: true }); if (key === undefined) delete process.env.OPENCODE_GO_API_KEY; else process.env.OPENCODE_GO_API_KEY = key; });
  writeFileSync(join(tmp, 'edit-input.json'), '{}');
  writeFileSync(join(tmp, 'edit-plan.json'), JSON.stringify({ stale: true }));
  const source = { span: 6, words: [{ word: 'Hola', start: .5, end: 1 }], assets: [] };
  await assert.rejects(planEdit(source, tmp), /OPENCODE_GO_API_KEY/);
  assert.equal(existsSync(join(tmp, 'edit-plan.json')), false);
  await assert.rejects(planEdit(source, tmp), /OPENCODE_GO_API_KEY/);
});

test('empty cached transcription cannot produce a video without subtitles', async t => {
  const tmp = mkdtempSync(join(tmpdir(), 'goatlab-transcript-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  writeFileSync(join(tmp, 'transcript.json'), JSON.stringify({ words: [] }));
  let planned = false;
  await assert.rejects(prepareShort({ tmp, voiceSeconds: 6, planner: () => { planned = true; } }), /transcripción vacía/);
  assert.equal(planned, false);
});
