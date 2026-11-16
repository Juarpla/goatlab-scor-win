import { env } from 'cloudflare:workers';
import { indexableFixtures, matchCalendar, unavailableCalendar } from '../lib/match-calendar-store.js';

export const prerender = false;

export async function GET() {
  try {
    const calendar = await matchCalendar(env);
    const rows = indexableFixtures(await calendar.list({ forSitemap: true }));
    const urls = rows.map(({ slug }) => `<url><loc>https://goatlab.win/partido/${slug}/</loc></url>`).join('');
    const headers = new Headers({ 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=30' });
    if (calendar.listTiming) headers.append('Server-Timing', calendar.listTiming);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers });
  } catch (error) {
    console.error('Match sitemap unavailable', error);
    return new Response('Calendario temporalmente no disponible', { status: 503, headers: unavailableCalendar() });
  }
}
