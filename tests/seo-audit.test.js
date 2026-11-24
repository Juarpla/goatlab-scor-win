import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSite, inspectHtml, reportMarkdown, robotsAllows } from '../scripts/lib/seo-audit.mjs';

const site = 'https://goatlab.win';
const html = (path, { robots = '', canonical = path, links = '', ads = '', title = path } = {}) => `<!doctype html><html><head><title>${title}</title><meta name='description' content='Contenido de ${path}'><link href='${site}${canonical}' rel='canonical'>${robots}</head><body><header><nav><a href='/'>Inicio</a></nav></header><main>${links}</main><footer>GoatLab</footer>${ads}</body></html>`;
const map = paths => `<urlset>${paths.map(path => `<url><loc>${site}${path}</loc></url>`).join('')}</urlset>`;
function fixture(overrides = {}) {
  const pages = {
    '/robots.txt': `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap-index.xml`,
    '/sitemap-index.xml': `<sitemapindex><sitemap><loc>${site}/sitemap-matches.xml</loc></sitemap><sitemap><loc>${site}/sitemap-editorial.xml</loc></sitemap></sitemapindex>`,
    '/sitemap-matches.xml': map(['/partido/a-vs-b-2026-11-25/']),
    '/sitemap-editorial.xml': map(['/el-juego-en-datos/']),
    '/': html('/', { links: '<a href="/encuentros/">Partidos</a><a href="/el-juego-en-datos/">Artículos</a>' }),
    '/encuentros/': html('/encuentros/', { links: '<a href="/partido/a-vs-b-2026-11-25/">Previa</a><a href="/partido/c-vs-d-2026-11-25/">Calendario</a>' }),
    '/el-juego-en-datos/': html('/el-juego-en-datos/'),
    '/partido/a-vs-b-2026-11-25/': html('/partido/a-vs-b-2026-11-25/'),
    '/partido/c-vs-d-2026-11-25/': html('/partido/c-vs-d-2026-11-25/', { robots: '<meta name="robots" content="noindex, follow">' }),
    ...overrides,
  };
  return async url => {
    const value = pages[url.pathname];
    return value instanceof Response ? value.clone() : new Response(value ?? 'Missing', { status: value === undefined ? 404 : 200 });
  };
}

test('HTML inspection ignores script strings, supports reordered attributes and combines robots rules', () => {
  const page = inspectHtml(html('/', { links: '<script>const text = \'<a href="/fake/">\';</script><a href="/ok/?a=1&amp;b=2">Go</a>', robots: '<meta content="noindex" name="googlebot">' }));
  assert.deepEqual(page.canonicals, [site + '/']);
  assert.deepEqual(page.links, ['/', '/ok/?a=1&b=2']);
  assert.equal(page.robots, 'noindex');
});

test('robots matching respects agent groups, wildcards and the most specific allow rule', () => {
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/public\nUser-agent: Googlebot\nDisallow: /*?draft=1$\nUser-agent: Mediapartners-Google\nDisallow: /';
  assert.equal(robotsAllows(robots, 'Other', '/private/page'), false);
  assert.equal(robotsAllows(robots, 'Other', '/private/public/page'), true);
  assert.equal(robotsAllows(robots, 'Googlebot', '/private/page'), true);
  assert.equal(robotsAllows(robots, 'Googlebot', '/x?draft=1'), false);
  assert.equal(robotsAllows(robots, 'Googlebot', '/x?draft=12'), true);
  assert.equal(robotsAllows(robots, 'Mediapartners-Google', '/'), false);
});

test('accessible SVG titles inside the article are not duplicate page titles', () => {
  const page = inspectHtml(html('/', { links: '<svg><title>Forma reciente</title></svg><svg><title>Probabilidades</title></svg>' }));
  assert.deepEqual(page.titles, ['/']);
});

test('valid sitemap and HTML pass without treating intentionally unindexed calendar pages as failures', async () => {
  const report = await auditSite({ fetcher: fixture() });
  assert.equal(report.summary.errors, 0, JSON.stringify(report.findings));
  assert.equal(report.summary.listedMatches, 2);
  assert.equal(report.summary.indexedMatches, 1);
  assert.ok(report.findings.some(row => row.code === 'structured-data-missing'));
  assert.ok(!report.findings.some(row => row.code === 'orphan-candidate'));
});

test('a noindex directive in an HTTP header blocks a sitemap entry and fails the audit', async () => {
  const report = await auditSite({ fetcher: fixture({ '/partido/a-vs-b-2026-11-25/': new Response(html('/partido/a-vs-b-2026-11-25/'), { headers: { 'X-Robots-Tag': 'noindex' } }) }) });
  assert.ok(report.findings.some(row => row.code === 'indexable-page-blocked' && row.level === 'error'));
});

test('the crawler follows pagination, detects broken targets and never calls external or production tools', async () => {
  const seen = [];
  const source = fixture({ '/el-juego-en-datos/': html('/el-juego-en-datos/', { links: '<a href="/pagina/2/">2</a><a href="https://elsewhere.test/">External</a><a href="/partido/a/media/">Tool</a>' }), '/pagina/2/': html('/pagina/2/', { links: '<a href="/broken/">Broken</a>' }) });
  const report = await auditSite({ fetcher: url => { seen.push(url.href); return source(url); } });
  assert.ok(seen.includes(site + '/pagina/2/'));
  assert.ok(report.findings.some(row => row.code === 'broken-page' && row.path === '/broken/'));
  assert.ok(!seen.some(url => url.includes('elsewhere') || url.includes('/media/')));
});

test('orphan candidates, duplicate metadata, canonical errors and empty links are reported', async () => {
  const report = await auditSite({ fetcher: fixture({
    '/sitemap-editorial.xml': map(['/el-juego-en-datos/', '/orphan/']),
    '/orphan/': html('/orphan/', { title: 'Repeated' }),
    '/el-juego-en-datos/': html('/el-juego-en-datos/', { title: 'Repeated', canonical: '/', links: '<a href="#">Empty</a>' }),
  }) });
  for (const code of ['orphan-candidate', 'duplicate-titles', 'canonical-mismatch', 'empty-link']) assert.ok(report.findings.some(row => row.code === code), code);
});

test('advertising exclusions, crawler blocks and sitemap dates are enforced', async () => {
  const report = await auditSite({ now: Date.parse('2026-11-24'), fetcher: fixture({
    '/robots.txt': `User-agent: Googlebot\nDisallow: /\nSitemap: ${site}/sitemap-index.xml`,
    '/sitemap-matches.xml': map(['/partido/a-vs-b-2026-11-25/']).replace('</url>', '<lastmod>2027-01-01</lastmod></url>'),
    '/encuentros/': html('/encuentros/', { ads: '<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>' }),
  }) });
  for (const code of ['robots-blocked', 'ads-on-excluded-page', 'lastmod-invalid']) assert.ok(report.findings.some(row => row.code === code), code);
});

test('sitemap redirects and HTTP failures fail, whereas bounded crawl coverage is explicit', async () => {
  const redirect = await auditSite({ fetcher: fixture({ '/partido/a-vs-b-2026-11-25/': new Response('', { status: 301, headers: { Location: '/encuentros/' } }) }) });
  assert.ok(redirect.findings.some(row => row.code === 'sitemap-redirect'));
  const failure = await auditSite({ fetcher: async () => { throw new Error('Timeout'); } });
  assert.ok(failure.summary.errors > 0);
  const bounded = await auditSite({ fetcher: fixture(), maxPages: 2 });
  assert.equal(bounded.summary.pages, 2);
  assert.ok(bounded.findings.some(row => row.code === 'crawl-limit'));
});

test('retired/error pages cannot serve ads even on an otherwise advertising-eligible path', async () => {
  const path = '/el-juego-en-datos/retired/';
  const report = await auditSite({ fetcher: fixture({
    '/sitemap-editorial.xml': map([path]),
    [path]: new Response(html(path, { ads: '<ins data-ad-slot="123"></ins>' }), { status: 410 }),
  }) });
  assert.ok(report.findings.some(row => row.code === 'ads-on-excluded-page' && row.path === path));
});

test('production tools and provider aliases are forbidden in sitemaps independently of meta robots', async () => {
  const path = '/partido/af-123/';
  const report = await auditSite({ fetcher: fixture({ '/sitemap-matches.xml': map([path]), [path]: html(path) }) });
  assert.ok(report.findings.some(row => row.code === 'excluded-page-in-sitemap'));
});

test('reports compare runs and escape remote markup in Markdown output', async () => {
  const report = await auditSite({ fetcher: fixture(), previous: { summary: { errors: 3, indexedMatches: 2 } } });
  assert.equal(report.delta.errors, -3);
  report.findings.push({ level: 'warning', code: 'sample', path: '/', detail: '<script>|unsafe\ntext' });
  const markdown = reportMarkdown(report);
  assert.match(markdown, /-3 errores/);
  assert.ok(!markdown.includes('<script>'));
});

test('temporary outages honor Retry-After and do not turn unavailable coverage into zero matches', async () => {
  const source = fixture();
  let attempts = 0;
  const report = await auditSite({ fetcher: url => {
    if (url.pathname === '/encuentros/') { attempts++; return new Response('Unavailable', { status: 503, headers: { 'Retry-After': '300' } }); }
    return source(url);
  } });
  assert.equal(attempts, 1);
  assert.equal(report.summary.listedMatches, null);
  assert.ok(report.findings.some(row => row.code === 'fetch-failed' && row.detail === 'HTTP 503'));
  assert.match(reportMarkdown(report), /dato no disponible/);
});
