import test from 'node:test';
import assert from 'node:assert/strict';
import { isProductionPage, isIndexablePage } from '../src/lib/page-policy.js';

test('herramientas y sus JSON quedan fuera de búsqueda con y sin barra final', () => {
  for (const category of ['scripts', 'image-prompts', 'video-prompts', 'media', 'youtube']) {
    for (const suffix of ['', '/', '.json', '/?copy=1']) {
      const url = `https://goatlab.win/partido/sevilla-vs-osasuna-2026-10-26/${category}${suffix}`;
      assert.equal(isProductionPage(url), true, url);
      assert.equal(isIndexablePage(url), false, url);
    }
  }
});

test('las páginas editoriales se indexan con su URL descriptiva', () => {
  for (const path of ['/', '/encuentros/', '/fuentes/', '/metodologia/', '/partido/sevilla-vs-osasuna-2026-10-26/']) {
    assert.equal(isProductionPage(path), false);
    assert.equal(isIndexablePage(path), true);
  }
  assert.equal(isIndexablePage('/partido/fd-564721/'), false);
  assert.equal(isIndexablePage('/partido/af-1570399'), false);
});
