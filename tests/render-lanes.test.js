import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanes, laneFor } from '../fly/render/lanes.mjs';

test('a light job finishes while a heavy job is still capturing', async () => {
  const run = createLanes();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let lightDone = false;
  const heavy = run('heavy', () => gate);
  await run('light', async () => { lightDone = true; });
  assert.equal(lightDone, true);
  release();
  await heavy;
});

test('heavy jobs stay one at a time and a failure does not stop the lane', async () => {
  const run = createLanes();
  let current = 0, max = 0;
  await Promise.all([1, 2, 3].map(() => run('heavy', async () => {
    current += 1;
    max = Math.max(max, current);
    await new Promise(resolve => setTimeout(resolve, 15));
    current -= 1;
  })));
  assert.equal(max, 1);
  await assert.rejects(run('heavy', async () => { throw new Error('captura'); }), /captura/);
  let recovered = false;
  await run('heavy', async () => { recovered = true; });
  assert.equal(recovered, true);
  assert.equal(laneFor({ operation: 'render' }), 'heavy');
  assert.equal(laneFor({ operation: 'prepare' }), 'light');
  assert.equal(laneFor({ operation: 'deliver' }), 'light');
});
