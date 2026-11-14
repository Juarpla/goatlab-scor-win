import { env } from 'cloudflare:workers';
import { indexableFixtures, matchCalendar, unavailableCalendar } from '../lib/match-calendar-store.js';

export const prerender = false;

export async function GET() {
  try {
    const rows = indexableFixtures(await (await matchCalendar(env)).list());
    const urls = rows.map(({ slug }) => `<url><loc>https://goatlab.win/partido/${slug}/</loc></url>`).join('');
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=30' },
    });
  } catch (error) {
    console.error('Match sitemap unavailable', error);
    return new Response('Calendario temporalmente no disponible', { status: 503, headers: unavailableCalendar() });
  }
}
