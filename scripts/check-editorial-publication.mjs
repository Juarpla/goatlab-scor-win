import assert from 'node:assert/strict';
import { EDITORIAL_LIMIT, EDITORIAL_ROOT, pagePath } from '../src/lib/editorial.js';

const origin = process.env.GOATLAB_CHECK_ORIGIN ?? 'http://127.0.0.1:4333';
const read = async (path, expected = 200) => {
  const response = await fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, expected, path);
  return response.text();
};

const sitemap = await read('/sitemap-editorial.xml');
const links = [...sitemap.matchAll(/<loc>https:\/\/goatlab\.win([^<]+)<\/loc>/g)].map(match => match[1]);
const pages = links.filter(path => path === EDITORIAL_ROOT || path.startsWith(`${EDITORIAL_ROOT}pagina/`));
const articles = links.filter(path => !pages.includes(path));
assert.ok(articles.length >= 10 && articles.length <= EDITORIAL_LIMIT);
assert.deepEqual(pages, pages.map((_, index) => pagePath(index + 1)));
const listings = [];
for (const path of pages) {
  const html = await read(path);
  assert.match(html, /Datos <em>jugados\./);
  assert.match(html, /editorial-ad-preview|data-ad-slot=/);
  assert.match(html, /¿Qué se juega hoy\?/);
  for (const page of pages) assert.ok(html.includes(`href="${page}"`), page);
  listings.push(html);
}
for (const path of articles) {
  assert.equal(listings.filter(html => html.includes(`href="${path}"`)).length, 1, path);
  const html = await read(path);
  assert.match(html, /<dialog[^>]+id="editorial-sources"/, path);
  assert.match(html, /editorial-(diagram|figure)/, path);
  assert.match(html, /<strong>/, path);
  assert.equal((html.match(/class="editorial-card"/g) ?? []).length, 3, path);
  assert.equal((html.match(/editorial-ad-preview|data-ad-slot=/g) ?? []).length, 2, path);
  assert.doesNotMatch(html, /content="noindex/);
}
await read(pagePath(1).replace(/\/$/, '/pagina/1/'), 301);
for (const path of [pagePath(pages.length + 1), `${EDITORIAL_ROOT}articulo-que-no-existe/`]) {
  const html = await read(path, 404);
  assert.doesNotMatch(html, /adsbygoogle|editorial-ad-preview/);
}
console.log(`Verified ${articles.length} editorials in ${pages.length} paginated listings.`);
