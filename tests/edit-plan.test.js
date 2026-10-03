import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedMotion, buildPlannedComposition } from '../src/lib/edit-plan.js';

test('movement stays inside native image resolution and crop margins', () => {
  const layer = { box: { x: 0, y: 0, w: 1, h: 1 }, from: { scale: 1.5, x: .25 }, to: { scale: 1.5, y: -.25 } };
  const small = boundedMotion(layer, { width: 736, height: 1312 });
  assert.equal(small.from.scale, 1);
  assert.equal(small.from.x, 0);
  const large = boundedMotion(layer, { width: 1472, height: 2624 });
  assert.ok(large.to.scale <= 1.35);
  assert.ok(large.imageWidth * large.to.scale <= 1472);
  assert.ok(Math.abs(large.to.y) <= (large.imageHeight * large.to.scale - 1920) / 2);
});

test('planned layers, graphics and all captions render with the brand closure', () => {
  const words = [{ word: 'España', start: .5, end: 1 }, { word: 'ganó', start: 1, end: 1.5 }, { word: '3', start: 1.5, end: 2 }];
  const html = buildPlannedComposition({ duration: 8, photos: [{ src: '0.jpg', width: 1472, height: 2624 }], words,
    plan: { scenes: [{ start: 0, end: 5, layers: [{ asset: 0, move: 'push' }], graphics: [
      { kind: 'stat', at: 1.5, duration: 2, wordStart: 2, wordEnd: 3 }, { kind: 'ring', at: 0, duration: 3 }] }] } });
  assert.match(html, /brand.svg/);
  assert.match(html, /goatlab.win/);
  assert.match(html, /color:#ffe14a/);
  assert.match(html, /-webkit-text-stroke:3px #000/);
  for (const word of words) assert.ok(html.includes(`>${word.word}</span>`));
  assert.match(html, /window.__timelines\['main'\]=tl/);
  assert.throws(() => buildPlannedComposition({ duration: 5, words: [], plan: { scenes: [{}] } }), /transcripción/);
});
