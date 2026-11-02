import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { testAudioDir } from '../video-render/contract/layout.js';
import { MAX_VOICE_RATE, VOICE_SECONDS } from '../video-render/contract/short-format.js';

const dir = testAudioDir(fileURLToPath(new URL('..', import.meta.url)));
const duration = (name) => Number(execFileSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(dir, name),
], { encoding: 'utf8' }).trim());

test('audio fixtures cover the accepted and rejected voice budgets', () => {
  const a = duration('under-limit-a.m4a');
  const b = duration('under-limit-b.m4a');
  const over = duration('over-limit.m4a');
  assert.ok(a > 0 && a <= VOICE_SECONDS);
  assert.ok(b > 0 && b <= VOICE_SECONDS);
  assert.ok(over > VOICE_SECONDS * MAX_VOICE_RATE);
});
