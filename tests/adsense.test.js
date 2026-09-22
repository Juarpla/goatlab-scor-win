import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');

test('Publisher ID viene de env en crudo y ca- solo se deriva', () => {
  const ads = read('src/config/ads.ts');
  assert.ok(ads.includes('PUBLIC_ADSENSE_PUBLISHER_ID'));
  assert.ok(ads.includes('PUBLISHER_ID'));
  assert.ok(ads.includes('AD_CLIENT = `ca-${PUBLISHER_ID}`'));
  assert.ok(ads.includes("'pub-1972487168739114'"));
  assert.ok(!ads.includes("'ca-pub-"));
});

test('durante la revisión no hay slots manuales activos', () => {
  const ads = read('src/config/ads.ts');
  assert.ok(ads.includes('Object.values(AD_SLOTS).some(Boolean)'));
  const block = ads.slice(ads.indexOf('AD_SLOTS = {'), ads.indexOf('} as const'));
  const slots = [...block.matchAll(/:\s*'([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  assert.deepEqual(slots, []);
});

test('ads.txt contiene la línea DIRECT del publisher', () => {
  assert.ok(read('public/ads.txt').includes('google.com, pub-1972487168739114, DIRECT, f08c47fec0942fa0'));
});

test('robots.txt expone el sitemap del dominio de revisión', () => {
  assert.ok(read('public/robots.txt').includes('Sitemap: https://goatlab.win/sitemap-index.xml'));
});

test('astro.config declara site + sitemap', () => {
  const config = read('astro.config.mjs');
  assert.ok(config.includes("site: 'https://goatlab.win'"));
  assert.ok(config.includes('sitemap'));
});

test('Layout carga verificación + CMP y enlaza a cookies', () => {
  const layout = read('src/layouts/Layout.astro');
  assert.ok(layout.includes('ADS_VERIFICATION'));
  assert.ok(layout.includes('PUBLISHER_ID'));
  assert.ok(layout.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'));
  assert.ok(layout.includes('fundingchoicesmessages.google.com/i/${PUBLISHER_ID}'));
  assert.ok(layout.includes('/cookies/'));
});

test('ads.txt se genera en build desde el ID en crudo', () => {
  const script = read('scripts/write-ads-txt.mjs');
  assert.ok(script.includes('PUBLIC_ADSENSE_PUBLISHER_ID'));
  assert.ok(script.includes('DIRECT, f08c47fec0942fa0'));
  assert.ok(!script.includes('ca-${'));
});

test('páginas legales existen y usan el contacto genérico', () => {
  assert.ok(existsSync(new URL('src/pages/cookies.astro', root)));
  for (const page of ['privacidad', 'cookies']) {
    const src = read(`src/pages/${page}.astro`);
    assert.ok(src.includes('contacto@scor.win'));
    assert.ok(src.includes('AdSense'));
  }
});
