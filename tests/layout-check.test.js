import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLayout, layoutMessages, SAFE_BOTTOM } from '../fly/render/layout-check.mjs';

const item = (frame, extra) => ({ frame, items: [{ text: 'Gol', x: 80, y: 200, w: 400, h: 80, fontSize: 64, clipped: false, visible: true, ...extra }] });

test('an entrance clipped on the first sample is not severe, and the middle sample is', () => {
  const entrance = classifyLayout([item(0, { clipped: true }), item(150), item(290)]);
  assert.equal(entrance.severe.length, 0);
  const middle = classifyLayout([item(0), item(150, { clipped: true }), item(290)]);
  assert.equal(middle.severe.length, 1);
  assert.equal(middle.severe[0].frame, 150);
});

test('small type and the shorts overlay are minor, and hidden text is ignored', () => {
  const layout = classifyLayout([
    item(10, { fontSize: 28, y: 1920 - SAFE_BOTTOM }),
    item(100, { text: 'oculto', visible: false, clipped: true }),
    item(200),
  ]);
  assert.equal(layout.severe.length, 0);
  assert.ok(layout.minor.some(entry => entry.kind === 'size'));
  assert.ok(layout.minor.some(entry => entry.kind === 'bottom'));
  assert.equal(layout.minor.some(entry => entry.text === 'oculto'), false);
  assert.ok(layoutMessages(layout).some(line => /28px/.test(line)));
});
