import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cuesFromHeard,
  planShots,
  captionPages,
  figuresFromWords,
  SHOT_MIN,
  SHOT_MAX,
} from '../src/lib/timing.js';

test('cuesFromHeard deja el texto oído y sus tiempos', () => {
  const heard = [
    { word: 'Francia', start: 0.2, end: 0.6 },
    { word: 'llega', start: 0.1, end: 0.15 },
    { word: 'cuatro', start: 1.1, end: 1.5 },
    { word: '', start: 2, end: 2.2 },
  ];
  const cues = cuesFromHeard(heard);
  assert.deepEqual(cues.map(c => c.word), ['llega', 'Francia', 'cuatro']);
  assert.equal(cues[1].start, 0.2);
  assert.equal(cues[2].word, 'cuatro');
  assert.deepEqual(cuesFromHeard([]), []);
});

test('planShots corta entre 2 y 4 segundos', () => {
  const words = [
    { word: 'uno', start: 0, end: 1 },
    { word: 'dos.', start: 1, end: 2.4 },
    { word: 'tres', start: 2.5, end: 3.2 },
    { word: 'cuatro', start: 3.2, end: 4 },
    { word: 'cinco', start: 4, end: 5.2 },
    { word: 'seis.', start: 5.2, end: 6.4 },
    { word: 'siete', start: 6.5, end: 8 },
    { word: 'ocho', start: 8, end: 10 },
  ];
  const shots = planShots(words, 10, 12);
  assert.equal(shots[0].start, 0);
  assert.equal(shots.at(-1).end, 10);
  for (const shot of shots) {
    const span = shot.end - shot.start;
    assert.ok(span >= SHOT_MIN - 0.01, `toma de ${span}s`);
    assert.ok(span <= SHOT_MAX + 0.01, `toma de ${span}s`);
    assert.ok(shot.photo >= 0 && shot.photo < 12);
  }
  assert.ok(shots.length >= 3);
});

test('captionPages corta en la puntuación y a las tres palabras', () => {
  const words = [
    { word: 'España', start: 0, end: 0.4 },
    { word: 'ganó', start: 0.4, end: 0.8 },
    { word: '4', start: 0.8, end: 1.1 },
    { word: 'de', start: 1.1, end: 1.3 },
    { word: 'sus.', start: 1.3, end: 1.8 },
  ];
  const pages = captionPages(words);
  assert.equal(pages[0].words.length, 3);
  assert.equal(pages[1].words.map(w => w.word).join(' '), 'de sus.');
  assert.equal(pages[0].words[2].index, 2);
});

test('figuresFromWords pone la cifra en el instante en que se dice', () => {
  const words = [
    { word: 'ganó', start: 0.5, end: 0.9 },
    { word: '4', start: 1.1, end: 1.4 },
    { word: 'de', start: 1.4, end: 1.6 },
    { word: '3,71', start: 2.0, end: 2.6 },
    { word: 'y', start: 2.6, end: 2.8 },
    { word: '4', start: 2.8, end: 3.1 },
  ];
  const figs = figuresFromWords(words);
  assert.deepEqual(figs.map(f => f.label), ['4', '3,71']);
  assert.equal(figs[0].at, 1.1);
  assert.equal(figs[1].value, 3.71);
  assert.equal(figs[1].comma, true);
  const spoken = figuresFromWords([{ word: 'cuatro', start: 0.4, end: 0.8 }]);
  assert.equal(spoken[0].label, '4');
  assert.equal(spoken[0].at, 0.4);
});
