import test from 'node:test';
import assert from 'node:assert/strict';
import { audioFailureText, pendingRecord, photoFailureText, queueDecision, renderRequest } from '../src/lib/render-queue.js';
import { normalizeAgnesImage } from '../src/lib/agnes.js';

const script = {
  home: 'Kazakhstan',
  away: 'Moldova',
  scripts: [{ title: 'El duelo', hook: 'Ojo', narration: 'Kazajistán recibe a Moldavia.' }],
};

test('pendingRecord toma los equipos y renderRequest manda el pool, no el guion', () => {
  const record = pendingRecord({
    chatId: '1', matchId: 'kz', variant: 0, audioFileId: 'file', script,
  });
  assert.equal(record.matchLabel, 'Kazakhstan contra Moldova');
  assert.equal(record.home, 'Kazakhstan');
  assert.equal(record.away, 'Moldova');
  assert.equal(record.narration, undefined);
  assert.equal(renderRequest(record, { assets: [] }), null);
  const ready = renderRequest(record, {
    assets: [
      { url: 'https://a', motive: 'training', query: 'Kazakhstan men', subject: null },
      { url: 'https://b', motive: 'fans', query: 'Moldova men', subject: null },
    ],
  });
  assert.equal(queueDecision({ ready: true, request: ready }), 'post');
  assert.equal(queueDecision({ ready: false, request: null }), 'pending');
  assert.equal(ready.assets.length, 2);
  assert.equal(ready.assets[0].motive, 'training');
  assert.equal(ready.narration, undefined);
});

test('photoFailureText se queda con el error útil', () => {
  const text = photoFailureText('media: buscando\nmedia: Agnes: HTTP 400\nruido\nfaltan fotos: 12 < 20\n');
  assert.match(text, /HTTP 400/);
  assert.doesNotMatch(text, /faltan fotos/);
  assert.doesNotMatch(text, /buscando/);
});

test('audioFailureText nombra el número y no pide reenviar el archivo', () => {
  assert.match(audioFailureText(2, 'ffmpeg: Invalid data found when processing input'), /El audio 2 que enviaste está corrompido/);
  assert.match(audioFailureText(2, 'voz de 1.0s fuera de rango (5-120s)'), /El video 2 no se pudo completar/);
  assert.doesNotMatch(audioFailureText(2, 'ffmpeg: Invalid data'), /file_id|reenvi/);
  assert.doesNotMatch(audioFailureText(2, 'telegram getFile: invalid file_id'), /corrompido|Grábalo/);
  assert.doesNotMatch(audioFailureText(2, 'descarga HTTP 500'), /corrompido|Grábalo/);
});

test('generated image provenance remains available to downstream consumers', () => {
  assert.equal(normalizeAgnesImage({ matchId: 'a-b', index: 0, publicUrl: 'http://insecure/image.jpg' }), null);
  const image = normalizeAgnesImage({ matchId: 'a-b', index: 0, publicUrl: 'https://media.test/0.jpg', prompt: 'Public prompt', at: '2026-10-06T00:00:00Z' });
  assert.equal(image.source, 'agnes'); assert.equal(image.query, 'Public prompt'); assert.ok(image.generated.model);
});
test('long voice requests a replacement rather than retrying the same recording', () => {
  assert.match(audioFailureText(2, 'Incluso acelerándolo un 10% supera el límite. Graba hasta 45 segundos'), /audio 2.*sustituir/s);
});
