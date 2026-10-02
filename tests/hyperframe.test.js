import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignWords,
  figuresFromNarration,
  buildComposition,
  cameraMove,
  FONT_FAMILY,
  FONT_FILE,
  CAPTION_FILL,
  CAPTION_EDGE,
  FRAME_W,
  FRAME_H,
} from '../src/lib/hyperframe.js';

test('alignWords reparte el guion sobre la voz', () => {
  const cues = alignWords('Turquía ganó 3 de 5', 10);
  assert.equal(cues.length, 5);
  assert.equal(cues[0].start, 0);
  assert.equal(cues.at(-1).word, '5');
  assert.ok(cues.at(-1).end > 9.9 && cues.at(-1).end < 10.1);
  assert.deepEqual(alignWords('', 10), []);
});

test('figuresFromNarration toma hasta tres cifras distintas', () => {
  const figs = figuresFromNarration('Turquía ganó 3 de 5, promedio 2,75 y otra vez 3.');
  assert.deepEqual(figs.map(f => f.label), ['3', '5', '2,75']);
  assert.equal(figs[2].value, 2.75);
});

test('la plantilla pinta 9:16, subtítulo amarillo con borde y la cámara pedida', () => {
  const words = alignWords('ganó 3 veces', 8);
  const html = buildComposition({
    duration: 12,
    photos: [{ src: '0.jpg' }, { src: '1.jpg' }, { src: '2.jpg' }, { src: '3.jpg' }],
    camera: 'pan-left',
    words,
    match: 'Turquía vs Italia',
  });
  assert.match(html, new RegExp(`data-width="${FRAME_W}"`));
  assert.match(html, new RegExp(`data-height="${FRAME_H}"`));
  assert.match(html, /data-composition-id="main"/);
  assert.match(html, /window\.__timelines\["main"\]/);
  assert.match(html, new RegExp(`color: ${CAPTION_FILL}`));
  assert.match(html, new RegExp(`0 ${CAPTION_EDGE}`));
  assert.match(html, /id="w0"/);
  assert.match(html, /id="f0"/);
  assert.match(html, />3</);
  assert.match(html, /x: 70/);
  assert.match(html, /x: -70/);
  assert.match(html, /scale: 1\.08/);
  assert.match(html, /id="flash"/);
  const tagged = buildComposition({
    duration: 12,
    photos: [{ src: '0.jpg', subject: 'Álvaro Morata' }],
    camera: 'push',
    words,
  });
  assert.match(tagged, /Álvaro Morata/);
  assert.match(tagged, /class="tag /);
  const other = buildComposition({
    duration: 12,
    photos: [{ src: '0.jpg' }],
    camera: 'rise',
    words: [],
    figures: [],
  });
  assert.match(other, /y: 60/);
  assert.notEqual(cameraMove('pan-left').from, cameraMove('rise').from);
  assert.doesNotMatch(html, /zoompan/);
  assert.match(html, new RegExp(`font-family: "${FONT_FAMILY}"`));
  assert.match(html, new RegExp(`@font-face \\{ font-family: "${FONT_FAMILY}"; src: url\\("${FONT_FILE}"\\)`));
  assert.doesNotMatch(html, /DejaVu|Arial/);
});
