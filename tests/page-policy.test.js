import test from 'node:test';
import assert from 'node:assert/strict';
import { isProductionPage, isIndexablePage, isAdvertisingPage } from '../src/lib/page-policy.js';

test('herramientas y sus JSON quedan fuera de búsqueda con y sin barra final', () => {
  for (const category of ['scripts', 'image-prompts', 'video-prompts', 'media', 'youtube']) {
    for (const suffix of ['', '/', '.json', '/?copy=1']) {
      const url = `https://goatlab.win/partido/sevilla-vs-osasuna-2026-10-26/${category}${suffix}`;
      assert.equal(isProductionPage(url), true, url);
      assert.equal(isIndexablePage(url), false, url);
    }
  }
});

test('las políticas siguen indexables y no cargan publicidad ni CMP', () => {
  for (const path of ['/privacidad', '/privacidad/', '/cookies', '/cookies/?lang=es']) {
    assert.equal(isIndexablePage(path), true);
    assert.equal(isAdvertisingPage(path), false);
  }
  assert.equal(isAdvertisingPage('/'), true);
  assert.equal(isAdvertisingPage('/partido/sevilla-vs-osasuna-2026-10-26/'), true);
  assert.equal(isAdvertisingPage('/partido/sevilla-vs-osasuna-2026-10-26/scripts/'), false);
  assert.equal(isAdvertisingPage('/partido/fd-564721/'), false);
});

test('las páginas editoriales se indexan con su URL descriptiva', () => {
  for (const path of ['/', '/encuentros/', '/fuentes/', '/metodologia/', '/partido/sevilla-vs-osasuna-2026-10-26/']) {
    assert.equal(isProductionPage(path), false);
    assert.equal(isIndexablePage(path), true);
  }
  assert.equal(isIndexablePage('/partido/fd-564721/'), false);
  assert.equal(isIndexablePage('/partido/af-1570399'), false);
});
