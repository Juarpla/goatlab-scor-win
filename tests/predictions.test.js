import test from 'node:test';
import assert from 'node:assert/strict';
import { predictGoals, publishablePrediction } from '../src/lib/predictions.js';
test('equal goal rates yield symmetric outcomes and normalized probabilities', () => {
  const p = predictGoals(1.5, 1.5);
  assert.ok(Math.abs(p.homeWin - p.awayWin) < 1e-12);
  assert.ok(Math.abs(p.homeWin + p.draw + p.awayWin - 1) < 1e-12);
});
test('zero goal rates imply a goalless draw', () => {
  const p = predictGoals(0,0); assert.equal(p.draw,1); assert.equal(p.bothScore,0);
});
test('unvalidated predictions cannot be published', () => {
  assert.equal(publishablePrediction(predictGoals(1,2), null), null);
});
test('invalid inputs cannot silently produce percentages', () => {
  assert.throws(() => predictGoals(NaN,1)); assert.throws(() => predictGoals(-1,1));
});
