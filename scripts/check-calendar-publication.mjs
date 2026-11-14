import assert from 'node:assert/strict';

const origin = process.env.GOATLAB_CHECK_ORIGIN ?? 'http://127.0.0.1:4321';
const get = path => fetch(new URL(path, origin), { redirect: 'manual' });
const html = async path => {
  const response = await get(path);
  return { response, body: await response.text() };
};
const noAds = body => assert.doesNotMatch(body, /pagead\/js\/adsbygoogle\.js|fundingchoicesmessages\.google\.com|class="adsbygoogle"/);
const [home, encounters, methods, archive, missing, sources, sourcesSlash, sitemap] = await Promise.all([
  '/', '/encuentros/', '/metodologia/', '/encuentros/archivo/', '/partido/unknown-match-999999/',
  '/fuentes', '/fuentes/', '/sitemap-matches.xml',
].map(html));
assert.equal(home.response.status, 200);
assert.match(home.body, /name="google-adsense-account" content="ca-pub-4320512940041280"/);
assert.match(home.body, /href="\/el-juego-en-datos\/">/);
assert.equal(encounters.response.status, 200);
assert.doesNotMatch(home.body + encounters.body, /href="\/encuentros\/archivo\//);
assert.equal(methods.response.status, 200);
for (const id of ['fuentes', 'marcadores', 'ventana', 'avanzadas', 'frecuencia', 'marcas']) {
  assert.match(methods.body, new RegExp(`id="${id}"`));
}
for (const { response } of [sources, sourcesSlash]) {
  assert.equal(response.status, 301);
  assert.equal(new URL(response.headers.get('location'), origin).pathname, '/metodologia/');
}
assert.equal(archive.response.status, 410);
assert.equal(missing.response.status, 404);
assert.equal(sitemap.response.status, 200);
for (const page of [encounters, archive, missing]) noAds(page.body);
const sitemapPaths = new Set([...sitemap.body.matchAll(/<loc>https:\/\/goatlab\.win([^<]+)<\/loc>/g)].map(match => match[1]));
const calendarPaths = new Set([...encounters.body.matchAll(/href="(\/partido\/[^"]+\/)" class="match-card"/g)].map(match => match[1]));
for (const path of sitemapPaths) assert.ok(calendarPaths.has(path), path);
const paths = [...calendarPaths];
if (!paths.length && process.env.GOATLAB_CHECK_ACTIVE) paths.push(process.env.GOATLAB_CHECK_ACTIVE);
for (const path of paths) {
  const detail = await html(path);
  assert.equal(detail.response.status, 200, path);
  assert.equal(detail.response.headers.has('x-robots-tag'), !sitemapPaths.has(path), path);
  noAds(detail.body);
}
if (process.env.GOATLAB_CHECK_ARCHIVED) {
  const final = await html(process.env.GOATLAB_CHECK_ARCHIVED);
  assert.equal(final.response.status, 200);
  assert.match(final.response.headers.get('x-robots-tag'), /noindex/);
  assert.match(final.body, /Marcador final/);
  assert.ok(!calendarPaths.has(process.env.GOATLAB_CHECK_ARCHIVED));
  noAds(final.body);
}
if (process.env.GOATLAB_CHECK_RETIRED) {
  const retired = await html(process.env.GOATLAB_CHECK_RETIRED);
  assert.equal(retired.response.status, 410);
  noAds(retired.body);
}
console.log(`Calendar HTTP checks passed: ${calendarPaths.size} listed, ${sitemapPaths.size} indexable.`);
