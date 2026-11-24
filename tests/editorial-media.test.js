import test from 'node:test';
import assert from 'node:assert/strict';
import { editorialImage } from '../src/lib/editorial-media.js';
import { listEditorials, getEditorial } from '../src/lib/editorial-store.js';
const cover = { source: 'agnes', url: 'https://example.com/cover.webp', alt: 'Ilustración conceptual de fútbol', width: 1280, height: 720 };
test('only valid, explicitly attributed images reach the shared template', () => {
  assert.equal(editorialImage(cover), cover);
  for (const input of [null, {}, { ...cover, url: 'javascript:alert(1)' }, { ...cover, source: 'unknown' }, { ...cover, width: 0 }, { ...cover, alt: '' }]) assert.equal(editorialImage(input), null);
});
test('D1 listing and article expose the same persisted cover without loading full prose in cards', async () => {
  const db = { prepare(sql) { return {
    all: async () => { assert.match(sql, /json_extract\(payload, '\$\.media\.cover'\)/); return { results: [{ slug: 'traspasos', cover: JSON.stringify(cover) }] }; },
    bind() { return { first: async () => ({ slug: 'traspasos', payload: JSON.stringify({ title: 'Traspasos', media: { cover } }) }) }; },
  }; } };
  const [listed] = await listEditorials(db);
  const article = await getEditorial(db, 'traspasos');
  assert.deepEqual(listed.cover, article.media.cover);
});
