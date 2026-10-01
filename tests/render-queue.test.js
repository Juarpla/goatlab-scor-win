import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingRecord, photoFailureText, queueDecision, renderRequest } from '../src/lib/render-queue.js';
import { agnesPrompts, normalizeAgnesImage } from '../src/lib/agnes.js';

const script = {
  home: 'Kazakhstan',
  away: 'Moldova',
  scripts: [{ title: 'El duelo', hook: 'Ojo', narration: 'Kazajistán recibe a Moldavia.' }],
};

test('pendingRecord toma el guion y renderRequest exige fotos', () => {
  const record = pendingRecord({
    chatId: '1', matchId: 'kz', variant: 0, audioFileId: 'file', script,
  });
  assert.equal(record.matchLabel, 'Kazakhstan contra Moldova');
  assert.equal(record.narration, 'Kazajistán recibe a Moldavia.');
  assert.equal(renderRequest(record, { sequences: [] }), null);
  const ready = renderRequest(record, {
    sequences: [{ camera: 'push', photos: ['https://a', 'https://b'], subjects: [null, 'Ana'] }],
  });
  assert.equal(queueDecision({ ready: true, request: ready }), 'post');
  assert.equal(queueDecision({ ready: false, request: null }), 'pending');
  assert.equal(ready.photos.length, 2);
  assert.equal(ready.camera, 'push');
});

test('photoFailureText se queda con el error útil', () => {
  const text = photoFailureText('media: buscando\nmedia: visión commons:1: HTTP 400\nruido\nfaltan fotos: 12 < 20\n');
  assert.match(text, /HTTP 400/);
  assert.match(text, /faltan fotos/);
  assert.doesNotMatch(text, /buscando/);
});

test('agnesPrompts no pide caras y normalize exige https', () => {
  const prompts = agnesPrompts({ home: 'Kazakhstan', away: 'Moldova', count: 3 });
  assert.equal(prompts.length, 3);
  assert.ok(prompts.every(prompt => /no recognizable faces|no people|no faces/.test(prompt)));
  assert.equal(normalizeAgnesImage({ matchId: 'kz', index: 0, publicUrl: 'http://insecure/a.jpg' }), null);
  const asset = normalizeAgnesImage({
    matchId: 'kz', index: 1, publicUrl: 'https://goatlab-gateway.fly.dev/media-gen/kz/1.jpg', model: 'agnes-image-2.1-flash', prompt: prompts[1], at: '2026-10-01T00:00:00.000Z',
  });
  assert.equal(asset.source, 'agnes');
  assert.equal(asset.subject, null);
  assert.equal(asset.motive, 'generated');
  assert.equal(asset.license, 'AI generated');
});
