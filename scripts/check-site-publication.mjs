import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { runInNewContext } from 'node:vm';
import { isProductionPage } from '../src/lib/page-policy.js';

const root = 'dist/client';
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const files = walk(root);
const tools = files.filter(file => file.endsWith('/index.html') && isProductionPage(`/${relative(root, file).replace(/index\.html$/, '')}`));
assert.ok(tools.length > 0, 'No se encontraron herramientas en la compilación');
for (const file of tools) {
  const html = readFileSync(file, 'utf8');
  assert.ok(/name="robots" content="noindex, follow"/.test(html), `${file}: falta noindex`);
  assert.ok(!html.includes('pagead/js/adsbygoogle.js'), `${file}: carga AdSense`);
  assert.ok(!html.includes('fundingchoicesmessages.google.com'), `${file}: carga CMP publicitaria`);
}
const sitemapFiles = files.filter(file => /sitemap-\d+\.xml$/.test(file));
assert.ok(sitemapFiles.length > 0, 'Falta sitemap');
let urls = 0;
for (const file of sitemapFiles) {
  for (const [, url] of readFileSync(file, 'utf8').matchAll(/<loc>(.*?)<\/loc>/g)) {
    assert.ok(!isProductionPage(url), `Herramienta incluida en sitemap: ${url}`);
    urls++;
  }
}
const home = readFileSync(join(root, 'index.html'), 'utf8');
assert.ok(home.includes('pagead/js/adsbygoogle.js'), 'Falta verificación de AdSense en la portada');
for (const path of ['privacidad', 'cookies']) {
  const html = readFileSync(join(root, path, 'index.html'), 'utf8');
  assert.ok(!html.includes('pagead/js/adsbygoogle.js'), `${path}: carga publicidad en una política`);
  assert.ok(!html.includes('fundingchoicesmessages.google.com'), `${path}: carga CMP en una política`);
}
assert.ok(home.includes('id="revoke-consent"'), 'Falta acceso para revisar consentimiento desde la portada');
const signal = [...home.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(script => script.includes('function signalGooglefcPresent'));
assert.ok(signal, 'Falta señal de presencia de la CMP');
const frames = [];
runInNewContext(signal, { window: { frames: {} }, document: { body: { appendChild: frame => frames.push(frame) }, createElement: () => ({ style: {} }) } });
assert.ok(frames.some(frame => frame.name === 'googlefcPresent'), 'La señal de la CMP no ejecuta su código');
const headers = readFileSync(join(root, '_headers'), 'utf8');
for (const path of ['/data/*', '/match-probabilities/*', '/content-index.json', '/partido/*.json']) {
  assert.ok(headers.includes(`${path}\n  X-Robots-Tag: noindex`), `Falta exclusión de JSON en Cloudflare: ${path}`);
}
for (const file of files.filter(file => /\/partido\/[^/]+\/index\.html$/.test(file))) {
  const html = readFileSync(file, 'utf8');
  assert.ok(!/href="\/partido\/[^"/]+\/(?:scripts|image-prompts|video-prompts|media)\/?"/.test(html), `${file}: enlaza herramientas desde el análisis público`);
}
console.log(`Publicación verificada: ${tools.length} herramientas accesibles sin indexación ni publicidad; ${urls} URL en sitemap; portada con verificación AdSense.`);
