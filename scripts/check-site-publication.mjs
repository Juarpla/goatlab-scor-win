import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { runInNewContext } from 'node:vm';
import { isAdvertisingPage, isProductionPage } from '../src/lib/page-policy.js';

const root = 'dist/client';
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const files = walk(root);
const site = new URL('https://goatlab.win');
const assetPaths = new Set(files.map(file => `/${relative(root, file)}`));
const htmlPages = new Map();
const attribute = (tag, name) => {
  const value = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return value && (value[1] ?? value[2] ?? value[3]);
};

for (const file of files.filter(file => file.endsWith('.html'))) {
  const path = `/${relative(root, file)}`;
  const html = readFileSync(file, 'utf8');
  const markup = html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const tags = [...markup.matchAll(/<[a-z][\w:-]*(?:"[^"]*"|'[^']*'|[^'">])*?>/gi)].map(([tag]) => tag);
  htmlPages.set(path, {
    ids: new Set(tags.map(tag => attribute(tag, 'id')).filter(Boolean)),
    hrefs: new Set(tags.filter(tag => /^<a(?:\s|>)/i.test(tag)).map(tag => attribute(tag, 'href')).filter(href => href !== null)),
  });
}

function targetPath(path) {
  if (assetPaths.has(path)) return path;
  return `${path.replace(/\/$/, '')}/index.html`;
}

const brokenLinks = [];
for (const [file, { hrefs }] of htmlPages) {
  const page = file.replace(/\/index\.html$/, '/');
  for (const rawHref of hrefs) {
    const href = rawHref.trim();
    if (!href || href === '#') {
      brokenLinks.push(`${page} → ${JSON.stringify(rawHref)} (empty destination)`);
      continue;
    }
    const target = new URL(href.replaceAll('&amp;', '&'), new URL(page, site));
    if (!['http:', 'https:'].includes(target.protocol) || target.hostname !== site.hostname) continue;
    const path = targetPath(decodeURIComponent(target.pathname));
    const fragment = decodeURIComponent(target.hash.slice(1).split(':~:')[0]);
    if (!assetPaths.has(path) || (fragment && htmlPages.has(path) && !htmlPages.get(path).ids.has(fragment))) {
      brokenLinks.push(`${page} → ${href}`);
    }
  }
}
assert.ok(!brokenLinks.length, `${brokenLinks.length} broken internal links:\n${brokenLinks.join('\n')}`);

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
const sitemapUrls = new Set();
for (const file of sitemapFiles) {
  for (const [, url] of readFileSync(file, 'utf8').matchAll(/<loc>(.*?)<\/loc>/g)) {
    assert.ok(!isProductionPage(url), `Herramienta incluida en sitemap: ${url}`);
    sitemapUrls.add(url);
  }
}
const home = readFileSync(join(root, 'index.html'), 'utf8');
const footer = home.match(/<footer\b[^>]*class="site-footer[^"\n]*"[^>]*>[\s\S]*?<\/footer>/i)?.[0] ?? '';
for (const path of ['/nosotros/', '/terminos/', '/privacidad/', '/cookies/', '/contacto/']) {
  assert.ok(footer.includes(`href="${path}"`), `Missing footer link: ${path}`);
  assert.ok(sitemapUrls.has(new URL(path, site).href), `Missing from sitemap: ${path}`);
}
const publisher = home.match(/name="google-adsense-account" content="ca-(pub-\d{16})"/)?.[1];
assert.ok(publisher, 'Missing AdSense verification meta tag on the home page');
assert.ok(readFileSync(join(root, 'ads.txt'), 'utf8').includes(`google.com, ${publisher}, DIRECT,`), 'Publisher mismatch');
const serving = home.includes('pagead/js/adsbygoogle.js');
for (const file of files.filter(file => file.endsWith('/index.html') || file === join(root, 'index.html'))) {
  const path = `/${relative(root, file).replace(/index\.html$/, '')}`;
  const html = readFileSync(file, 'utf8');
  const shouldServe = serving && isAdvertisingPage(path);
  assert.equal(html.includes('pagead/js/adsbygoogle.js'), shouldServe, file);
  assert.equal(html.includes('fundingchoicesmessages.google.com'), shouldServe, file);
  assert.equal(html.includes('id="revoke-consent"'), shouldServe, file);
}
if (serving) {
  const signal = [...home.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(script => script.includes('function signalGooglefcPresent'));
  assert.ok(signal, 'Missing CMP presence signal');
  const frames = [];
  runInNewContext(signal, { window: { frames: {} }, document: { body: { appendChild: frame => frames.push(frame) }, createElement: () => ({ style: {} }) } });
  assert.ok(frames.some(frame => frame.name === 'googlefcPresent'), 'CMP presence signal did not run');
}
const ignoredAssets = readFileSync(join(root, '.assetsignore'), 'utf8').split(/\r?\n/);
for (const path of ['/data/history-stats.json', '/data/predictions.json', '/data/team-stats.json']) {
  assert.ok(ignoredAssets.includes(path), `Internal capture exposed by the deployment: ${path}`);
}
const headers = readFileSync(join(root, '_headers'), 'utf8');
for (const path of ['/data/*', '/match-probabilities/*', '/content-index.json', '/partido/*.json']) {
  assert.ok(headers.includes(`${path}\n  X-Robots-Tag: noindex`), `Falta exclusión de JSON en Cloudflare: ${path}`);
}
for (const file of files.filter(file => /\/partido\/[^/]+\/index\.html$/.test(file))) {
  const html = readFileSync(file, 'utf8');
  assert.ok(!html.includes('SabidurIA externa'), `${file}: provider copy used as the primary fallback`);
  assert.ok(!/href="\/partido\/[^"/]+\/(?:scripts|image-prompts|video-prompts|media)\/?"/.test(html), `${file}: enlaza herramientas desde el análisis público`);
}
console.log(`Publicación verificada: ${htmlPages.size} páginas sin enlaces internos rotos; ${tools.length} herramientas sin indexación ni publicidad; ${sitemapUrls.size} URL en sitemap; portada con verificación AdSense.`);
