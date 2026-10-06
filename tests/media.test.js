import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS_PER_MATCH, ALLOWED_SOURCES, assetErrors, selectAssets, buildManifest, AI_CREDIT } from '../src/lib/media.js';
import { normalizeAgnesImage } from '../src/lib/agnes.js';
const image = i => normalizeAgnesImage({ matchId: 'a-b', index: i, publicUrl: `https://media.test/${i}.jpg` });
test('only generated Agnes assets with provenance enter the shared bank', () => {
  assert.deepEqual(ALLOWED_SOURCES, ['agnes']); assert.equal(ASSETS_PER_MATCH, 4);
  assert.deepEqual(assetErrors(image(0)), []);
  for (const invalid of [{ ...image(0), source: 'external' }, { ...image(0), generated: {} }, { ...image(0), url: 'http://media.test/0.jpg' }]) assert.ok(assetErrors(invalid).length);
});
test('bank deduplicates slots, caps four and preserves referential credit', () => {
  const bank = buildManifest({ match: { id: 'a-b', home: 'A', away: 'B' }, assets: [image(0), image(0), ...Array.from({ length: 7 }, (_, i) => image(i))] });
  assert.equal(bank.assets.length, 4); assert.equal(bank.attribution, AI_CREDIT);
  assert.deepEqual(selectAssets([]), []);
});
