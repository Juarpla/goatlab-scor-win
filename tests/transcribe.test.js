import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseMistral,
  parseWhisperCpp,
  transcribeWords,
} from '../fly/render/transcribe.mjs';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

test('parseMistral y parseWhisperCpp normalizan los tiempos', () => {
  assert.deepEqual(parseMistral({
    segments: [
      { text: 'España', start: 0, end: 0.5 },
      { text: ' ganó', start: 0.5, end: 0.9 },
    ],
  }).map(w => w.word), ['España', 'ganó']);
  assert.deepEqual(parseWhisperCpp({
    transcription: [
      { text: ' España', offsets: { from: 100, to: 500 } },
      { text: '[_BEG_]', offsets: { from: 0, to: 0 } },
    ],
  }), [{ word: 'España', start: 0.1, end: 0.5 }]);
});

test('si Mistral falla se pasa a whisper.cpp', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'goatlab-stt-'));
  const flac = join(dir, 'voice.flac');
  const wav = join(dir, 'voice.wav');
  writeFileSync(flac, 'flac');
  const first = await transcribeWords({
    flac, wav, voiceSeconds: 12,
    env: { MISTRAL_API_KEY: 'm' },
    fetchImpl: async () => jsonResponse({ segments: [{ text: 'ganó', start: 0.2, end: 0.6 }] }),
  });
  assert.equal(first.provider, 'mistral');
  assert.equal(first.words[0].word, 'ganó');
  assert.equal(first.errors.length, 0);

  const local = await transcribeWords({
    flac, wav, voiceSeconds: 12,
    env: { MISTRAL_API_KEY: 'm' },
    fetchImpl: async () => jsonResponse({}, 500),
    runImpl: async (_bin, args) => {
      writeFileSync(`${args[args.indexOf('-of') + 1]}.json`, JSON.stringify({
        transcription: [{ text: 'España', offsets: { from: 0, to: 400 } }],
      }));
    },
  });
  assert.equal(local.provider, null);
  assert.ok(local.errors.some(e => e.startsWith('mistral')));
  assert.ok(local.errors.some(e => e.startsWith('whisper.cpp')));
});
