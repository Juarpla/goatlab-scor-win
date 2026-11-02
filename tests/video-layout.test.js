import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertAudioInput,
  assertMatchId,
  assertVideoOutput,
  audioRoot,
  layoutProblems,
  matchAudioDir,
  matchRecipeDir,
  matchVideoDir,
  recipeRoot,
  testAudioDir,
  testVideoDir,
  videoName,
  videoRoot,
} from '../video-render/contract/layout.js';

const MATCH = 'real-racing-club-vs-real-madrid-2026-11-01';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

function tree(t) {
  const root = mkdtempSync(join(tmpdir(), 'goatlab-layout-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function touch(file, content = '') {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

test('the working tree follows the media layout', () => {
  assert.deepEqual(layoutProblems(ROOT), []);
});

test('a tree that follows the contract has no problems', (t) => {
  const root = tree(t);
  touch(join(matchAudioDir(root, MATCH), 'Track-93.m4a'));
  touch(join(testAudioDir(root), 'under-limit-a.m4a'));
  touch(join(testAudioDir(root), 'README.md'));
  touch(join(matchVideoDir(root, MATCH), 'video.mp4'));
  touch(join(testVideoDir(root), 'demo.mp4'));
  touch(join(testVideoDir(root), '.gitkeep'));
  touch(join(recipeRoot(root), '.gitkeep'));
  touch(join(matchRecipeDir(root, MATCH), 'manifest.json'));
  touch(join(matchRecipeDir(root, MATCH), 'video.plan.json'));
  touch(join(matchRecipeDir(root, MATCH), 'video.composition.json'));
  assert.deepEqual(layoutProblems(root), []);
});

test('media outside a match folder is reported', (t) => {
  const root = tree(t);
  touch(join(audioRoot(root), 'loose.m4a'));
  touch(join(videoRoot(root), 'loose.mp4'));
  const messages = layoutProblems(root).map(problem => problem.message);
  assert.deepEqual(messages, [
    'voice recordings must live in audios/<match-id>/',
    'only match folders and tests/ belong in videos/',
  ]);
});

test('recipes cannot leak into videos', (t) => {
  const root = tree(t);
  touch(join(matchVideoDir(root, MATCH), 'video.mp4'));
  touch(join(matchVideoDir(root, MATCH), 'video.plan.json'));
  const messages = layoutProblems(root).map(problem => problem.message);
  assert.deepEqual(messages, ['only MP4 files belong in videos/<match-id>/']);
});

test('work only accepts match folders at its root', (t) => {
  const root = tree(t);
  touch(join(recipeRoot(root), '.gitkeep'));
  touch(join(recipeRoot(root), 'notes.md'));
  touch(join(recipeRoot(root), '_old', 'artifact.json'));
  touch(join(matchRecipeDir(root, MATCH), 'qa', 'frame.jpg'));
  const messages = layoutProblems(root).map(problem => problem.message).sort();
  assert.deepEqual(messages, [
    'folder name must be a match id',
    'only match folders belong in work/',
  ].sort());
});

test('match ids are slugs and tests is reserved', () => {
  assert.equal(assertMatchId(MATCH), MATCH);
  assert.throws(() => assertMatchId('tests'), /reserved for test media/);
  assert.throws(() => assertMatchId('../escape'), /invalid match id/);
  assert.throws(() => assertMatchId('Real Racing'), /invalid match id/);
});

test('the CLI only accepts audio inside the match or fixture folder', (t) => {
  const root = tree(t);
  const fromMatch = join(matchAudioDir(root, MATCH), 'voice.m4a');
  const fromFixtures = join(testAudioDir(root), 'under-limit-a.m4a');
  assert.equal(assertAudioInput(root, fromMatch, MATCH), fromMatch);
  assert.equal(assertAudioInput(root, fromFixtures, MATCH), fromFixtures);
  assert.throws(() => assertAudioInput(root, join(root, 'voice.m4a'), MATCH), /audio must be/);
});

test('the CLI only writes videos into the match or tests folder', (t) => {
  const root = tree(t);
  const fromMatch = join(matchVideoDir(root, MATCH), 'video.mp4');
  const fromTests = join(testVideoDir(root), 'demo.mp4');
  assert.equal(assertVideoOutput(root, fromMatch, MATCH), fromMatch);
  assert.equal(assertVideoOutput(root, fromTests, MATCH), fromTests);
  assert.throws(() => assertVideoOutput(root, join(videoRoot(root), 'video.mp4'), MATCH), /output must be/);
  assert.throws(() => assertVideoOutput(root, join(matchVideoDir(root, 'other-match'), 'video.mp4'), MATCH), /output must be/);
});

test('video names are derived from match, audio and variant', () => {
  assert.equal(videoName(MATCH, '/tmp/Track-93.m4a', 2), `${MATCH}-Track-93-v2.mp4`);
  assert.throws(() => videoName(MATCH, 'Track-93.m4a', -1), /invalid variant/);
});
