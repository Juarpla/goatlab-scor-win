import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { esName } from '../src/lib/teams.js';
import { normalizeAgnesImage } from '../src/lib/agnes.js';
import { contentFingerprint, bankComplete } from '../src/lib/media-contract.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const now = Date.parse('2026-10-08T22:00:00Z');
const match = { id: 'af-1', webId: 'a-b', home: 'Real Madrid CF', away: 'FC Barcelona', competition: 'laliga', kickoff: '2026-10-09T18:00:00Z' };
function pack(category, count) {
  return { version: 1, category, matchId: 'a-b', home: esName(match.home), away: esName(match.away), competition: match.competition, kickoff: match.kickoff, prompts: Array.from({ length: count }, (_, index) => ({ n: index + 1, prompt: `Exact ${category} input ${index}`, title: 'editorial label' })) };
}
function bank() {
  const assets = Array.from({ length: 4 }, (_, index) => ({ ...normalizeAgnesImage({ matchId: 'a-b', index, publicUrl: `https://media.test/${index}.jpg`, at: new Date(now).toISOString() }), sha256: hash(`photo ${index}`) }));
  const clips = Array.from({ length: 2 }, (_, index) => ({ id: `a-b-clip-${index}`, source: 'agnes', url: `https://media.test/clip-${index}.mp4`, model: 'agnes-video-2.5-flash', width: 720, height: 1280, duration: 6, sha256: hash(`clip ${index}`), promptHash: hash(`video prompt ${index}`), referenceHash: hash(assets[index].url) }));
  return { bankVersion: 2, bankStatus: 'complete', matchId: 'a-b', contentFingerprint: contentFingerprint(match, pack('image-prompts', 4), pack('video-prompts', 2)), storageVerifiedAt: new Date(now).toISOString(), assets, clips };
}
const options = value => ({ matchId: 'a-b', fingerprint: value.contentFingerprint, now });

test('fingerprint follows exact Agnes input and effective models, excluding editorial metadata', () => {
  const images = pack('image-prompts', 4), videos = pack('video-prompts', 2);
  const initial = contentFingerprint(match, images, videos);
  assert.match(initial, /^[a-f0-9]{64}$/);
  const metadata = { ...images, generatedAt: 'another date', author: { model: 'another LLM' }, motionPrompts: ['unrelated'] };
  metadata.prompts = images.prompts.map(row => ({ ...row, title: 'changed title' }));
  assert.equal(contentFingerprint(match, metadata, videos), initial);
  assert.equal(contentFingerprint({ ...match, kickoff: '2026-10-09T18:00:00+00:00' }, images, videos), initial);
  assert.notEqual(contentFingerprint(match, { ...images, generationModel: 'another-image-model' }, videos), initial);
  assert.notEqual(contentFingerprint(match, images, { ...videos, generationModel: 'another-video-model' }), initial);
  const changed = structuredClone(images); changed.prompts[0].prompt += ' ';
  assert.notEqual(contentFingerprint(match, changed, videos), initial);
});

test('invalid prompt identity or incomplete inputs cannot have a fingerprint', () => {
  const images = pack('image-prompts', 4), videos = pack('video-prompts', 2);
  for (const override of [{ matchId: 'other' }, { home: 'Other Home' }, { away: 'Other Away' }, { competition: 'other' }, { kickoff: '2026-10-09T19:00:00Z' }, { prompts: [] }, { generationModel: '' }]) {
    assert.equal(contentFingerprint(match, { ...images, ...override }, videos), null);
  }
  assert.equal(contentFingerprint(match, images, null), null);
  assert.equal(contentFingerprint({ ...match, kickoff: 'unknown' }, images, videos), null);
});

test('a complete bank needs version, matching fingerprint and trustworthy storage time', () => {
  const value = bank();
  assert.equal(bankComplete(value, options(value)), true);
  for (const override of [{ bankVersion: 1 }, { bankStatus: 'partial' }, { contentFingerprint: hash('other') }, { storageVerifiedAt: 'unknown' }, { storageVerifiedAt: new Date(now + 1).toISOString() }]) {
    assert.equal(bankComplete({ ...value, ...override }, options(value)), false);
  }
  assert.equal(bankComplete(value, { ...options(value), fingerprint: 'legacy' }), false);
  assert.equal(bankComplete(value, { ...options(value), matchId: 'other' }), false);
});

test('four photographs must be valid Agnes resources with distinct identity, URL and bytes', () => {
  const value = bank();
  for (const change of [photo => delete photo.sha256, photo => { photo.source = 'external'; }, photo => { photo.url = 'http://media.test/photo.jpg'; }, photo => { photo.width = '720'; }]) {
    const invalid = structuredClone(value); change(invalid.assets[0]);
    assert.equal(bankComplete(invalid, options(value)), false);
  }
  for (const field of ['id', 'url', 'sha256']) {
    const duplicate = structuredClone(value); duplicate.assets[1][field] = duplicate.assets[0][field];
    assert.equal(bankComplete(duplicate, options(value)), false);
  }
  assert.equal(bankComplete({ ...value, assets: value.assets.slice(0, 3) }, options(value)), false);
});

test('clips require probe bounds and prompt/reference evidence tied to retained photos', () => {
  const value = bank();
  for (const override of [{ source: 'external' }, { width: 1280 }, { height: 720 }, { duration: 3.99 }, { duration: 12.51 }, { sha256: null }, { promptHash: null }, { referenceHash: hash('unrelated reference') }, { model: '' }]) {
    const invalid = structuredClone(value); Object.assign(invalid.clips[0], override);
    assert.equal(bankComplete(invalid, options(value)), false);
  }
  for (const duration of [4, 12.5]) {
    const valid = structuredClone(value); valid.clips[0].duration = duration;
    assert.equal(bankComplete(valid, options(value)), true);
  }
  for (const field of ['id', 'url', 'sha256']) {
    const duplicate = structuredClone(value); duplicate.clips[1][field] = duplicate.clips[0][field];
    assert.equal(bankComplete(duplicate, options(value)), false);
  }
});

test('mode-specific completion does not claim the missing other half', () => {
  const value = bank();
  const photosOnly = { ...value, clips: [] };
  assert.equal(bankComplete(photosOnly, { ...options(value), mode: 'images-only' }), true);
  assert.equal(bankComplete(photosOnly, options(value)), false);
  const clipsOnly = { ...value, assets: value.assets.slice(0, 2) };
  assert.equal(bankComplete(clipsOnly, { ...options(value), mode: 'clips-only' }), true);
  assert.equal(bankComplete(clipsOnly, options(value)), false);
  assert.equal(bankComplete({ ...value, assets: [] }, { ...options(value), mode: 'clips-only' }), false);
});
