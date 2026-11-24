import { isAdvertisingPage, isIndexablePage, isProductionPage } from '../../src/lib/page-policy.js';

const decode = value => value.replace(/&amp;|&quot;|&#39;|&lt;|&gt;/g, entity => ({ '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' })[entity]);
const plain = value => decode(value.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(([, key, a, b, c]) => [key.toLowerCase(), decode(a ?? b ?? c)]));

export function inspectHtml(html) {
  const markup = html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const head = markup.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  const tags = [...markup.matchAll(/<[a-z][\w:-]*(?:"[^"]*"|'[^']*'|[^'">])*?>/gi)].map(([tag]) => tag);
  const headTags = [...head.matchAll(/<[a-z][\w:-]*(?:"[^"]*"|'[^']*'|[^'">])*?>/gi)].map(([tag]) => tag);
  const metas = headTags.filter(tag => /^<meta\b/i.test(tag)).map(attributes);
  return {
    titles: [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map(([, text]) => plain(text)),
    descriptions: metas.filter(meta => meta.name?.toLowerCase() === 'description').map(meta => meta.content ?? ''),
    canonicals: headTags.filter(tag => /^<link\b/i.test(tag)).map(attributes).filter(tag => tag.rel?.toLowerCase() === 'canonical').map(tag => tag.href ?? ''),
    robots: metas.filter(meta => ['robots', 'googlebot'].includes(meta.name?.toLowerCase())).map(meta => meta.content ?? '').join(','),
    links: tags.filter(tag => /^<a\b/i.test(tag)).map(attributes).filter(tag => tag.href !== undefined && !/\bnofollow\b/i.test(tag.rel ?? '')).map(tag => tag.href),
    landmarks: ['header', 'main', 'nav', 'footer'].filter(tag => new RegExp(`<${tag}\\b`, 'i').test(markup)),
    ads: /pagead\/js\/adsbygoogle\.js|class=["']adsbygoogle\b|data-ad-slot=/i.test(html),
    jsonld: /<script\b[^>]*type=["']application\/ld\+json["']/i.test(html),
  };
}

export function robotsAllows(text, agent, path) {
  const groups = [];
  let group;
  let hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const match = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const [, field, value] = match;
    if (field.toLowerCase() === 'user-agent') {
      if (!group || hasRules) { group = { agents: [], rules: [] }; groups.push(group); hasRules = false; }
      group.agents.push(value.toLowerCase());
    } else if (group && /^(allow|disallow)$/i.test(field)) {
      hasRules = true;
      if (value) group.rules.push({ allow: field.toLowerCase() === 'allow', path: value });
    }
  }
  const specific = groups.filter(group => group.agents.includes(agent.toLowerCase()));
  const rules = (specific.length ? specific : groups.filter(group => group.agents.includes('*'))).flatMap(group => group.rules);
  const matching = rules.filter(rule => {
    const pattern = rule.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replace(/\\\$$/, '$');
    return new RegExp(`^${pattern}`).test(path);
  }).sort((a, b) => b.path.replace(/[*$]/g, '').length - a.path.replace(/[*$]/g, '').length || Number(b.allow) - Number(a.allow));
  return matching[0]?.allow ?? true;
}

export async function auditSite({ origin = 'https://goatlab.win', fetcher = fetch, maxPages = 200, now = Date.now(), previous = null, maxDurationMs = 360_000 } = {}) {
  const site = new URL(origin).origin;
  const deadline = performance.now() + maxDurationMs;
  const findings = [];
  const pages = new Map();
  const edges = new Map();
  const sitemapUrls = new Set();
  const sitemapPaths = new Set();
  const add = (level, code, path, detail) => findings.push({ level, code, path, detail });
  const local = (value, base = site) => { try { const url = new URL(value, base); return url.origin === site ? url : null; } catch { return null; } };
  async function read(path) {
    let error;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const start = performance.now();
        const remaining = Math.floor(deadline - performance.now());
        if (remaining <= 0) throw new Error('Audit time budget exhausted');
        const response = await fetcher(new URL(path, site), { redirect: 'manual', signal: AbortSignal.timeout(Math.min(15_000, remaining)), headers: { 'User-Agent': 'GoatLab-SEO-Maintenance/1.0' } });
        const body = await response.text();
        if (body.length > 3_000_000) throw new Error('Response exceeds the audit size limit');
        if (response.status === 429 || response.status >= 500) {
          error = new Error(`HTTP ${response.status}`);
          // Respect a recovery window instead of immediately repeating a rejected read.
          if (response.headers.has('retry-after')) break;
          continue;
        }
        return { status: response.status, headers: response.headers, body, ms: Math.round(performance.now() - start) };
      } catch (failure) { error = failure; }
    }
    add('error', 'fetch-failed', path, String(error?.message ?? error));
    return null;
  }
  const robots = await read('/robots.txt');
  if (robots && robots.status !== 200) add('error', 'robots-status', '/robots.txt', `HTTP ${robots.status}`);
  if (robots?.status === 200 && !robots.body.includes(`${site}/sitemap-index.xml`)) add('error', 'sitemap-not-declared', '/robots.txt', 'Falta la declaración del índice de sitemaps.');
  const maps = ['/sitemap-index.xml'];
  for (let index = 0; index < maps.length && index < 10; index++) {
    const path = maps[index];
    const response = await read(path);
    if (!response) continue;
    if (response.status !== 200 || !/<(?:sitemapindex|urlset)\b/.test(response.body) || !/<\/(?:sitemapindex|urlset)>/.test(response.body)) { add('error', 'sitemap-invalid', path, `Sitemap inválido (HTTP ${response.status}).`); continue; }
    sitemapPaths.add(path);
    const isIndex = /<sitemapindex\b/.test(response.body);
    for (const [, value] of response.body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
      const url = local(decode(value));
      if (!url || url.search || url.hash) { add('error', 'sitemap-url-invalid', path, `URL no canónica o externa: ${value}`); continue; }
      if (isIndex) { if (!maps.includes(url.pathname)) maps.push(url.pathname); }
      else {
        sitemapUrls.add(url.pathname);
        if (!isIndexablePage(url.href)) add('error', 'excluded-page-in-sitemap', url.pathname, 'Una herramienta, alias o archivo excluido aparece en el sitemap.');
      }
    }
    for (const [, value] of response.body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
      const date = Date.parse(value);
      if (!Number.isFinite(date) || date > now + 300_000) add('error', 'lastmod-invalid', path, `Fecha inválida o futura: ${value}`);
    }
  }
  if (maps.length > 10) add('warning', 'sitemap-limit', '/', 'Se alcanzó el límite de diez sitemaps.');
  for (const path of ['/sitemap-matches.xml', '/sitemap-editorial.xml']) if (!sitemapPaths.has(path)) add('error', 'sitemap-missing', path, 'El índice no publica este sitemap requerido.');
  const pending = new Set(['/', '/encuentros/', '/el-juego-en-datos/', ...sitemapUrls]);
  while (pending.size && pages.size < maxPages && performance.now() < deadline) {
    const batch = [...pending].filter(path => !pages.has(path)).slice(0, Math.min(3, maxPages - pages.size));
    if (!batch.length) break;
    batch.forEach(path => pending.delete(path));
    await Promise.all(batch.map(async path => {
      pages.set(path, null);
      const response = await read(path);
      if (!response) return;
      const info = inspectHtml(response.body);
      pages.set(path, { ...info, status: response.status, ms: response.ms });
      edges.set(path, []);
      if (info.ads && (response.status !== 200 || !isAdvertisingPage(path))) add('error', 'ads-on-excluded-page', path, 'Publicidad en una ruta excluida o respuesta de error.');
      if (response.status >= 300 && response.status < 400) {
        const target = local(response.headers.get('location'), new URL(path, site));
        if (sitemapUrls.has(path)) add('error', 'sitemap-redirect', path, 'El sitemap contiene una redirección.');
        if (target && target.pathname !== path) { edges.get(path).push(target.pathname); if (!pages.has(target.pathname)) pending.add(target.pathname); }
        else add('error', 'redirect-invalid', path, 'Redirección externa, vacía o circular.');
        return;
      }
      if (response.status !== 200) { add('error', 'broken-page', path, `HTTP ${response.status} desde enlaces públicos o sitemap.`); return; }
      for (const [field, values] of [['title', info.titles], ['description', info.descriptions], ['canonical', info.canonicals]]) {
        if (values.length !== 1 || !values[0]?.trim()) add('error', `${field}-invalid`, path, `Se esperaba un único ${field} no vacío.`);
      }
      if (info.canonicals.length === 1 && info.canonicals[0] !== `${site}${path}`) add('error', 'canonical-mismatch', path, `Canonical inesperado: ${info.canonicals[0]}`);
      const noindex = /\bnoindex\b|\bnone\b/i.test(`${info.robots},${response.headers.get('x-robots-tag') ?? ''}`);
      if ((sitemapUrls.has(path) || path === '/') && noindex) add('error', 'indexable-page-blocked', path, 'Una página del sitemap o la portada declara noindex.');
      if (info.landmarks.length !== 4) add('warning', 'landmarks-missing', path, 'Faltan regiones semánticas de navegación o contenido.');
      if (!noindex && !info.jsonld && /^\/(?:partido|el-juego-en-datos)\/[^/]+\/$/.test(path) && !path.includes('/pagina/')) add('warning', 'structured-data-missing', path, 'Pendiente: datos estructurados acordes con el contenido visible.');
      for (const agent of ['Googlebot', 'Mediapartners-Google']) if (robots?.status === 200 && !robotsAllows(robots.body, agent, path)) add('error', 'robots-blocked', path, `robots.txt bloquea ${agent}.`);
      for (const href of info.links) {
        if (!href.trim() || href.trim() === '#') { add('error', 'empty-link', path, 'Enlace vacío o href="#".'); continue; }
        const url = local(href, new URL(path, site));
        if (!url || isProductionPage(url.href) || /\.[a-z0-9]{2,5}$/i.test(url.pathname) || /^\/(?:api|data|_astro|match-probabilities)\//.test(url.pathname)) continue;
        edges.get(path).push(url.pathname);
        if (!pages.has(url.pathname)) pending.add(url.pathname);
      }
    }));
  }
  if (pending.size) {
    const timedOut = performance.now() >= deadline;
    add(timedOut ? 'error' : 'warning', timedOut ? 'crawl-time-limit' : 'crawl-limit', '/', `${pending.size} rutas pendientes; cobertura parcial por ${timedOut ? 'el límite de tiempo' : `el límite de ${maxPages} páginas`}.`);
  }
  const reachable = new Set(['/']);
  const queue = ['/'];
  for (let index = 0; index < queue.length; index++) for (const path of edges.get(queue[index]) ?? []) if (!reachable.has(path)) { reachable.add(path); queue.push(path); }
  for (const path of sitemapUrls) if (!reachable.has(path)) add('warning', 'orphan-candidate', path, 'No se encontró un recorrido de enlaces desde la portada en el HTML auditado.');
  for (const field of ['titles', 'descriptions']) {
    const groups = new Map();
    for (const [path, page] of pages) if (page?.status === 200 && sitemapUrls.has(path) && page[field][0]) {
      const value = page[field][0]; groups.set(value, [...groups.get(value) ?? [], path]);
    }
    for (const paths of groups.values()) if (paths.length > 1) add('warning', `duplicate-${field}`, paths[0], paths.join(', '));
  }
  const listed = (edges.get('/encuentros/') ?? []).filter(path => /^\/partido\/[^/]+\/$/.test(path));
  const listedMatches = pages.get('/encuentros/')?.status === 200 ? new Set(listed).size : null;
  const indexedMatches = [...sitemapUrls].filter(path => path.startsWith('/partido/')).length;
  if (listedMatches >= 5 && indexedMatches / listedMatches < .25) add('warning', 'low-match-coverage', '/encuentros/', `${indexedMatches} partidos en sitemap frente a ${listedMatches} enlazados. Revisar previas validadas; no retirar noindex automáticamente.`);
  const summary = { pages: pages.size, sitemapUrls: sitemapUrls.size, listedMatches, indexedMatches, errors: findings.filter(row => row.level === 'error').length, warnings: findings.filter(row => row.level === 'warning').length };
  const delta = previous?.summary ? Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, typeof value === 'number' && typeof previous.summary[key] === 'number' ? value - previous.summary[key] : null])) : null;
  return { version: 1, origin: site, generatedAt: new Date(now).toISOString(), summary, delta, findings, pages: [...pages].map(([path, page]) => ({ path, status: page?.status ?? null, ms: page?.ms ?? null })) };
}

export function reportMarkdown(report) {
  const escape = value => String(value).replace(/[|\r\n]/g, ' ').replace(/</g, '&lt;');
  const { summary } = report;
  return `## Mantenimiento SEO · GoatLab\n\n${summary.errors ? 'Se detectaron errores que requieren atención.' : 'Comprobaciones técnicas completadas sin errores.'}\n\n` +
    `${summary.pages} páginas revisadas · ${summary.sitemapUrls} URL en sitemaps · ${summary.errors} errores · ${summary.warnings} observaciones.\n\n` +
    `Partidos: ${summary.indexedMatches} en sitemap / ${summary.listedMatches ?? 'dato no disponible'} enlazados desde Encuentros. La indexación real se confirma en Search Console.\n\n` +
    (report.delta ? `Cambio respecto a la ejecución anterior: ${report.delta.errors >= 0 ? '+' : ''}${report.delta.errors} errores; ${report.delta.indexedMatches >= 0 ? '+' : ''}${report.delta.indexedMatches} partidos en sitemap.\n\n` : '') +
    `| Nivel | Comprobación | Ruta | Detalle |\n| --- | --- | --- | --- |\n` + report.findings.slice(0, 100).map(row => `| ${row.level} | ${row.code} | ${escape(row.path)} | ${escape(row.detail)} |`).join('\n') +
    '\n\nEl artefacto JSON contiene todos los hallazgos. Las latencias HTTP no sustituyen Core Web Vitals. No se modifican robots, canonical, anuncios ni políticas de poda durante la auditoría.\n';
}
