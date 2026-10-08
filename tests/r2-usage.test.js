import test from 'node:test';
import assert from 'node:assert/strict';
import { addUsage, monthUsage } from '../src/lib/r2-usage.js';
const october = Date.parse('2026-10-31T23:59:59Z'), november = october + 1000;
test('meter records per-run deltas once and separates control from media by UTC month', () => {
  let ledger = addUsage({}, { media: { opsA: 2, opsB: 5 }, control: { opsA: 1, opsB: 3 } }, october);
  ledger = addUsage(ledger, { media: { opsA: 1, opsB: 2 } }, october);
  assert.deepEqual(monthUsage(ledger, october), { opsA: 4, opsB: 10, media: { opsA: 3, opsB: 7 }, control: { opsA: 1, opsB: 3 } });
  ledger = addUsage(ledger, { control: { opsA: 2, opsB: 4 } }, november);
  assert.equal(monthUsage(ledger, november).opsA, 2); assert.equal(monthUsage(ledger, october).opsA, 4);
});
test('legacy counters retain their recorded month and invalid values cannot inflate or erase it', () => {
  const ledger = addUsage({ opsA: 12, opsB: 34, updatedAt: new Date(october).toISOString() }, { media: { opsA: -1, opsB: NaN } }, november);
  assert.equal(monthUsage(ledger, october).opsA, 12); assert.equal(monthUsage(ledger, november).opsA, 0);
});
