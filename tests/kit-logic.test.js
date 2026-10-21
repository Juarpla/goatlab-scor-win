import test from 'node:test';
import assert from 'node:assert/strict';
import { phrases, wordAt, fitFontSize } from '../fly/render/kit/kit-logic.mjs';

test('phrases split on pauses and word count, and wordAt stays on the edges', () => {
  const words = [
    { word: 'el', start: 0, end: .2 }, { word: 'gol', start: .2, end: .4 },
    { word: 'llega', start: .9, end: 1.1 }, { word: 'tarde', start: 1.1, end: 1.3 },
  ];
  assert.equal(phrases(words, { maxWords: 3, gap: .35 }).length, 2);
  assert.equal(phrases(words, { maxWords: 1 }).length, 4);
  assert.equal(wordAt(words, 0), 0);
  assert.equal(wordAt(words, .4), -1);
  assert.equal(wordAt(words, 1.2), 3);
});

test('fitFontSize stays inside its minimum and maximum', () => {
  assert.equal(fitFontSize('Gol', { maxWidth: 2000, max: 120, min: 40 }), 120);
  assert.equal(fitFontSize('x'.repeat(80), { maxWidth: 400, max: 120, min: 40 }), 40);
});
