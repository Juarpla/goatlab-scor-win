import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

test('default capture budget accepts 25 minutes and environment overrides remain supported', () => {
  const module = new URL('../fly/render/capture-budget.mjs', import.meta.url).href;
  const check = (value, expected) => execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { CAPTURE_BUDGET_MS, budgetError } from ${JSON.stringify(module)};
    assert.equal(CAPTURE_BUDGET_MS, ${expected});
    assert.equal(budgetError({ projectedMs: ${expected}, perFrameMs: 100 }), null);
    assert.equal(budgetError({ projectedMs: ${expected} + 1, perFrameMs: 100 }).code, 'CAPTURE_BUDGET');
  `], { env: { ...process.env, CAPTURE_BUDGET_MS: value } });
  check('', 25 * 60_000);
  check('600000', 10 * 60_000);
});
