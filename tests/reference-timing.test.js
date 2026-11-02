import test from 'node:test';
import assert from 'node:assert/strict';
import { alignScripts } from '../video-render/engine/reference-timing.mjs';

const heard = ['el', 'real', 'madrid', 'gana', 'cuatro', 'a', 'cero'].map((word, index) => ({ word, start: index, end: index + .8 }));

test('alignScripts elige el guion con mejor coincidencia y reporta su número', () => {
  const best = alignScripts(heard, [
    { n: 2, narration: 'El Racing Club empata sin goles' },
    { n: 7, narration: 'El Real Madrid gana cuatro a cero' },
  ], 8);
  assert.equal(best.n, 7);
  assert.ok(best.score > .8);
});

test('alignScripts ignora candidatos vacíos y devuelve null sin guiones', () => {
  assert.equal(alignScripts(heard, [], 8), null);
  assert.equal(alignScripts(heard, [{ n: 1, narration: '  ' }], 8), null);
});
