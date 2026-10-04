import test from 'node:test';
import assert from 'node:assert/strict';
import { audioFailureText, pendingRecord, photoFailureText, queueDecision, renderRequest } from '../src/lib/render-queue.js';
import { agnesAfter429, agnesPrompts, normalizeAgnesImage } from '../src/lib/agnes.js';

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
  const text = photoFailureText('media: buscando\nmedia: visión commons:1: HTTP 400\nruido\nfaltan fotos: 12 < 20\n');
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

test('agnesPrompts pide hombres en entrenamiento y corta al segundo 429', () => {
  const prompts = agnesPrompts({ home: 'Liverpool', away: 'Moldova', count: 3 });
  assert.equal(prompts.length, 3);
  assert.match(prompts[0], /adult men/);
  assert.match(prompts[0], /contesting a ball/);
  assert.match(prompts[0], /fictional/);
  assert.match(prompts[0], /#c8102e/);
  assert.match(prompts[1], /training/);
  assert.match(prompts[2], /training/);
  assert.ok(prompts.every(prompt => /no official logos or sponsors/i.test(prompt)));
  assert.ok(prompts.every(prompt => !/match lighting|night match/i.test(prompt)));
  assert.equal(agnesAfter429(1), 'retry');
  assert.equal(agnesAfter429(2), 'stop');
  assert.equal(normalizeAgnesImage({ matchId: 'kz', index: 0, publicUrl: 'http://insecure/a.jpg' }), null);
  const asset = normalizeAgnesImage({
    matchId: 'kz', index: 1, publicUrl: 'https://goatlab-gateway.fly.dev/media-gen/kz/1.jpg', model: 'agnes-image-2.1-flash', prompt: prompts[1], at: '2026-10-01T00:00:00.000Z',
  });
  assert.equal(asset.source, 'agnes');
  assert.equal(asset.subject, null);
  assert.equal(asset.motive, 'generated');
  assert.equal(asset.license, 'AI generated');
});
