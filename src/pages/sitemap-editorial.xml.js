import { env } from 'cloudflare:workers';
import { EDITORIAL_PAGE_SIZE, editorialPath, pagePath } from '../lib/editorial.js';
import { listEditorials } from '../lib/editorial-store.js';

export const prerender = false;

export async function GET() {
  try {
    const articles = await listEditorials(env.GOATLAB_DB);
    const pages = Array.from({ length: Math.max(1, Math.ceil(articles.length / EDITORIAL_PAGE_SIZE)) }, (_, index) => pagePath(index + 1));
    const urls = [...pages.map(path => [path, null]), ...articles.map(row => [editorialPath(row.slug), row.updated_at])];
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([path, date]) => `<url><loc>https://goatlab.win${path}</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`).join('')}</urlset>`, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
    });
  } catch (error) {
    console.error('Editorial sitemap unavailable', error);
    return new Response('Datos jugados temporalmente no disponible', { status: 503, headers: { 'Retry-After': '300', 'Cache-Control': 'no-store' } });
  }
}
