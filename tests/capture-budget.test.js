import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCapture, budgetError } from '../fly/render/capture-budget.mjs';

test('capture projection scales with frames and workers and blocks only past the limit', () => {
  assert.equal(projectCapture({ perFrameMs: 100, frames: 300, workers: 1, calibration: 1 }), 30000);
  assert.equal(projectCapture({ perFrameMs: 100, frames: 300, workers: 2, calibration: 1 }), 15000);
  assert.equal(budgetError({ projectedMs: 10 * 60_000, perFrameMs: 400, limitMs: 18 * 60_000 }), null);
  const error = budgetError({ projectedMs: 19 * 60_000, perFrameMs: 691, limitMs: 18 * 60_000 });
  assert.equal(error.code, 'CAPTURE_BUDGET');
  assert.match(error.message, /19 min/);
  assert.match(error.message, /691 ms/);
});
