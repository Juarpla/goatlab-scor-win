import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');

test('AdSense usa el Publisher ID de revisión', () => {
  const ads = read('src/config/ads.ts');
  assert.ok(ads.includes("AD_CLIENT = 'ca-pub-1972487168739114'"));
  assert.ok(ads.includes('ADS_VERIFICATION'));
});

test('durante la revisión no hay slots manuales activos', () => {
  const ads = read('src/config/ads.ts');
  assert.ok(ads.includes('Object.values(AD_SLOTS).some(Boolean)'));
  const slots = [...ads.matchAll(/:\s*'([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  assert.deepEqual(slots, []);
});

test('ads.txt contiene la línea DIRECT del publisher', () => {
  assert.ok(read('public/ads.txt').includes('google.com, pub-1972487168739114, DIRECT, f08c47fec0942fa0'));
});

test('robots.txt expone el sitemap del dominio de revisión', () => {
  assert.ok(read('public/robots.txt').includes('Sitemap: https://goatlab.scor.win/sitemap-index.xml'));
});

test('astro.config declara site + sitemap', () => {
  const config = read('astro.config.mjs');
  assert.ok(config.includes("site: 'https://goatlab.scor.win'"));
  assert.ok(config.includes('sitemap'));
});

test('Layout carga verificación + CMP y enlaza a cookies', () => {
  const layout = read('src/layouts/Layout.astro');
  assert.ok(layout.includes('ADS_VERIFICATION'));
  assert.ok(layout.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'));
  assert.ok(layout.includes('fundingchoicesmessages.google.com/i/pub-1972487168739114'));
  assert.ok(layout.includes('/cookies/'));
});

test('páginas legales existen y usan el contacto genérico', () => {
  assert.ok(existsSync(new URL('src/pages/cookies.astro', root)));
  for (const page of ['privacidad', 'cookies']) {
    const src = read(`src/pages/${page}.astro`);
    assert.ok(src.includes('contacto@scor.win'));
    assert.ok(src.includes('AdSense'));
  }
});
