// Plantilla GoatLabShort v1: plan determinista + filtergraph verificable sin ffmpeg.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  buildShortPlan,
  buildFilterGraph,
  textSvg,
  textPng,
  logoPng,
  SHORT_W,
  SHORT_H,
  SHORT_FPS,
} from '../src/lib/short.js';

const script = {
  matchId: 'x-vs-y-2026-09-24',
  home: 'X',
  away: 'Y',
  scripts: [{ hook: 'Hook', beats: ['a', 'b', 'c', 'd'] }],
};
const media = {
  matchId: 'x-vs-y-2026-09-24',
  match: 'X vs Y',
  assets: [{ id: '1' }, { id: '2' }, { id: '3' }],
};

test('plan: 3 segmentos, direcciones alternadas, ~42s totales', () => {
  const p = buildShortPlan({ script, media });
  assert.equal(p.width, SHORT_W);
  assert.equal(p.height, SHORT_H);
  assert.equal(p.fps, SHORT_FPS);
  assert.equal(p.segments.length, 3);
  assert.deepEqual(
    p.segments.map((s) => s.direction),
    ['in', 'out', 'in'],
  );
  assert.equal(p.photosSeconds, 40); // 3x14 - 2x1
  assert.equal(p.totalSeconds, 42); // 40 + 3 - 1
  assert.deepEqual(p.xfadeOffsets, [13, 26]);
  assert.equal(p.endcardOffset, 39);
  assert.equal(p.brand, 'goatlab.win');
});

test('plan: variante inexistente usa la primera', () => {
  const p = buildShortPlan({ script, media, variant: 99 });
  assert.equal(p.hook, 'Hook');
});

test('textSvg centra el texto con tamaño y color', () => {
  const svg = textSvg({ text: 'goatlab.win', fontSize: 110, color: '#c5ed74' });
  assert.match(svg, /font-size="110"/);
  assert.match(svg, /fill="#c5ed74"/);
  assert.match(svg, /text-anchor="middle"/);
  assert.match(svg, /goatlab\.win/);
});

test('textPng y logoPng generan PNG cacheados', () => {
  const t = textPng({ text: 'goatlab.win', fontSize: 64, color: '#c5ed74' });
  const l = logoPng();
  assert.ok(existsSync(t));
  assert.ok(existsSync(l));
  assert.equal(textPng({ text: 'goatlab.win', fontSize: 64, color: '#c5ed74' }), t);
});

test('filtergraph contiene Ken Burns, xfades, logo y end card sin drawtext', () => {
  const p = buildShortPlan({ script, media });
  const g = buildFilterGraph(p, { logo: 3, bottom: 4, endMain: 5, endSub: 6 });
  assert.match(g, /zoompan/);
  assert.match(g, /xfade=transition=fade:duration=1:offset=13/);
  assert.match(g, /xfade=transition=fade:duration=1:offset=26/);
  assert.match(g, /xfade=transition=fade:duration=1:offset=39/);
  assert.match(g, /\[3:v\]format=rgba\[vlogo\]/);
  assert.match(g, /overlay=60:60/);
  assert.match(g, /enable='between\(t,39,42\)'/);
  assert.match(g, /1080x1920/);
  assert.match(g, /\[vout\]$/);
  assert.doesNotMatch(g, /drawtext/);
});
