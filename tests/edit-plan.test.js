import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedMotion, compositionProps } from '../src/lib/edit-plan.js';

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

test('render input rejects gaps, overruns and nonexistent photos', () => {
  const input={frames:270,photos:[],words:[{word:'Datos',start:.5,end:1}],plan:{version:4,scenes:[{start:0,end:6,layers:[],graphics:[]}]}};
  assert.equal(compositionProps(input).frames,270);
  assert.throws(()=>compositionProps({...input,frames:1500}),/límite/);
  assert.throws(()=>compositionProps({...input,plan:{...input.plan,scenes:[{start:1,end:6}]}}),/timeline/);
  assert.throws(()=>compositionProps({...input,plan:{...input.plan,scenes:[{start:0,end:6,layers:[{asset:0}]}]}}),/imagen/);
});
