import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const run = (...args) => {
  try {
    execFileSync(process.execPath, ['scripts/motion-contact-sheet.mjs', ...args], { stdio: 'pipe' });
    return 0;
  } catch (e) { return e.status; }
};
test('contact-sheet exige tag y shots o zoom', () => {
  assert.equal(run(), 2);
  assert.equal(run('--tag=x'), 2);
});
test('contact-sheet rechaza shots inválidos y más de 12 clips', () => {
  assert.notEqual(run('--tag=x', '--out=/tmp/cs-test', '--shots', 'clip.mp4@abc'), 0);
  const many = Array.from({ length: 13 }, (_, i) => `c${i}.mp4@1,2`).join(';');
  assert.notEqual(run('--tag=x', '--out=/tmp/cs-test', '--shots', many), 0);
});
