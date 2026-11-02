import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAudio, prepareAudio } from '../video-render/cli/audio.mjs';
import { matchAudioDir } from '../video-render/contract/layout.js';

const MATCH = 'barcelona-vs-aston-villa-2026-11-03';

function tree(t) {
  const root = mkdtempSync(join(tmpdir(), 'goatlab-audio-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('prepare creates the match audio folder', (t) => {
  const root = tree(t);
  const dir = prepareAudio(root, MATCH);
  assert.equal(dir, matchAudioDir(root, MATCH));
  assert.ok(existsSync(dir));
});

test('check fails until exactly one audio exists', (t) => {
  const root = tree(t);
  const dir = prepareAudio(root, MATCH);
  assert.throws(() => checkAudio(root, MATCH), /no hay audio/);

  writeFileSync(join(dir, 'voice.m4a'), '');
  assert.equal(checkAudio(root, MATCH).file, join(dir, 'voice.m4a'));

  writeFileSync(join(dir, 'voice-2.m4a'), '');
  assert.throws(() => checkAudio(root, MATCH), /hay 2 audios/);
  assert.equal(checkAudio(root, MATCH, join(dir, 'voice-2.m4a')).file, join(dir, 'voice-2.m4a'));
});

test('check rejects audio outside the match folder', (t) => {
  const root = tree(t);
  prepareAudio(root, MATCH);
  assert.throws(() => checkAudio(root, MATCH, join(root, 'voice.m4a')), /audio must be/);
});

test('prepare rejects invalid and reserved match ids', (t) => {
  const root = tree(t);
  assert.throws(() => prepareAudio(root, 'tests'), /reserved for test media/);
  assert.throws(() => prepareAudio(root, '../escape'), /invalid match id/);
});
