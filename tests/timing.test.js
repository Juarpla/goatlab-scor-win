import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignToScript,
  anchorsMatch,
  anchorWarning,
  planShots,
  captionPages,
  figuresFromWords,
  SHOT_MIN,
  SHOT_MAX,
} from '../src/lib/timing.js';

const script = 'España ganó 4 de sus últimos 5, con 8 goles.';

test('alignToScript hereda el tiempo oído y conserva el guion', () => {
  const heard = [
    { word: 'Espana', start: 0.1, end: 0.5 },
    { word: 'gano', start: 0.6, end: 1.0 },
    { word: 'cuatro', start: 1.1, end: 1.5 },
    { word: 'de', start: 1.5, end: 1.7 },
    { word: 'sus', start: 1.7, end: 1.9 },
    { word: 'ultimos', start: 2.0, end: 2.5 },
    { word: 'cinco', start: 2.6, end: 3.1 },
    { word: 'con', start: 3.4, end: 3.6 },
    { word: 'ocho', start: 3.7, end: 4.1 },
    { word: 'goles', start: 4.2, end: 4.8 },
  ];
  const cues = alignToScript(script, heard, 5);
  assert.deepEqual(cues.map(c => c.word), script.split(/\s+/));
  assert.equal(cues[0].start, 0.1);
  assert.equal(cues[2].word, '4');
  assert.equal(cues[2].start, 1.1);
  assert.equal(cues[6].start, 2.6);
  assert.ok(cues.every((c, i) => i === 0 || c.start >= cues[i - 1].start));
});

test('alignToScript interpola huecos y descarta palabras de más', () => {
  const heard = [
    { word: 'eh', start: 0, end: 0.2 },
    { word: 'España', start: 0.3, end: 0.7 },
    { word: 'ganó', start: 0.8, end: 1.2 },
    { word: 'goles.', start: 4.0, end: 4.6 },
  ];
  const cues = alignToScript(script, heard, 5);
  assert.equal(cues[0].start, 0.3);
  assert.equal(cues.at(-1).start, 4);
  const middle = cues.slice(2, -1);
  assert.ok(middle.every(c => c.start >= 1.2 && c.end <= 4));
  assert.deepEqual(alignToScript(script, [], 5), []);
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

test('las anclas aceptan equipos y cifras dichas en palabras', () => {
  const narration = 'España ganó 4 de sus últimos 5, con 8 goles a favor y 1 en contra, y Croacia ganó 3.';
  const heard = ['España', 'ganó', 'cuatro', 'de', 'cinco', 'con', 'ocho', 'y', 'uno', 'Croacia', 'tres'];
  assert.equal(anchorsMatch(narration, heard, 'España contra Croacia'), true);
});

test('las anclas rechazan otro partido o unas cifras que no son las del guion', () => {
  const narration = 'España ganó 4 de sus últimos 5, con 8 goles a favor y 1 en contra, y Croacia ganó 3.';
  assert.equal(
    anchorsMatch(narration, ['Francia', 'ganó', 'cuatro', 'de', 'cinco', 'ocho', 'uno', 'Alemania', 'tres'], 'España contra Croacia'),
    false,
  );
  const other = ['España', 'ganó', 'siete', 'Croacia', 'ganó', 'dos', 'de', 'siete', 'promedio', 'tres', 'coma', 'setenta', 'y', 'uno'];
  assert.equal(anchorsMatch(narration, other, 'España contra Croacia'), false);
  assert.equal(anchorsMatch('España y Croacia empataron.', ['España', 'y', 'Croacia'], 'España contra Croacia'), true);
});

test('el aviso de anclas sale antes de renderizar y no con el reparto', () => {
  const narration = 'España ganó 4 y Croacia 8.';
  assert.equal(anchorWarning({
    provider: 'mistral', narration, heard: ['Francia', 'ocho'], matchLabel: 'España contra Croacia', variant: 2,
  }), '❓ ¿este era el guion 3?');
  assert.equal(anchorWarning({
    provider: 'reparto', narration, heard: [], matchLabel: 'España contra Croacia', variant: 2,
  }), null);
  assert.equal(anchorWarning({
    provider: 'mistral', narration, heard: ['España', 'cuatro', 'Croacia', 'ocho'], matchLabel: 'España contra Croacia', variant: 2,
  }), null);
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
});
