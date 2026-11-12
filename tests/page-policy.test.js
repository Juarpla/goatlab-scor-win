import test from 'node:test';
import assert from 'node:assert/strict';
import { isProductionPage, isIndexablePage, isAdvertisingPage, robotsDirective } from '../src/lib/page-policy.js';

test('tools and their JSON stay out of search with and without a trailing slash', () => {
  for (const category of ['scripts', 'image-prompts', 'motion-prompts', 'video-prompts', 'media', 'youtube']) {
    for (const suffix of ['', '/', '.json', '/?copy=1']) {
      const url = `https://goatlab.win/partido/sevilla-vs-osasuna-2026-10-26/${category}${suffix}`;
      assert.equal(isProductionPage(url), true, url);
      assert.equal(isIndexablePage(url), false, url);
    }
  }
});

test('only script and legacy motion prompt views get nofollow', () => {
  const match = '/partido/sevilla-vs-osasuna-2026-10-26';
  for (const category of ['scripts', 'motion-prompts']) {
    for (const suffix of ['', '/', '/?copy=1']) {
      assert.equal(robotsDirective(`${match}/${category}${suffix}`), 'noindex, nofollow');
      assert.equal(isAdvertisingPage(`${match}/${category}${suffix}`), false);
    }
  }
  assert.equal(robotsDirective(`${match}/image-prompts/`), 'noindex, follow');
  assert.equal(robotsDirective('/partido/af-1570399/'), 'noindex, follow');
  assert.equal(robotsDirective(`${match}/`), null);
});

test('policy pages remain indexable and load no ads or CMP', () => {
  for (const path of ['/privacidad', '/privacidad/', '/cookies', '/cookies/?lang=es']) {
    assert.equal(isIndexablePage(path), true);
    assert.equal(isAdvertisingPage(path), false);
  }
  assert.equal(isAdvertisingPage('/'), true);
  assert.equal(isAdvertisingPage('/metodologia/'), true);
  for (const path of ['/contacto/', '/encuentros/', '/fuentes/', '/partido/sevilla-vs-osasuna-2026-10-26/']) {
    assert.equal(isAdvertisingPage(path), false, path);
  }
  assert.equal(isAdvertisingPage('/partido/sevilla-vs-osasuna-2026-10-26/scripts/'), false);
  assert.equal(isAdvertisingPage('/partido/fd-564721/'), false);
});

test('editorial pages are indexed with their descriptive URL', () => {
  for (const path of ['/', '/encuentros/', '/fuentes/', '/metodologia/', '/partido/sevilla-vs-osasuna-2026-10-26/']) {
    assert.equal(isProductionPage(path), false);
    assert.equal(isIndexablePage(path), true);
  }
  assert.equal(isIndexablePage('/partido/fd-564721/'), false);
  assert.equal(isIndexablePage('/partido/af-1570399'), false);
});
