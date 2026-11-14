import visuals from '../content/editorial-visuals.json';
import { getCollection } from 'astro:content';
import { safeEditorialLink } from '../lib/editorial.js';

export const prerender = true;

export async function GET() {
  const entries = await getCollection('editorial');
  const articles = entries.map(entry => {
    const { date, order, ...content } = entry.data;
    const html = entry.rendered?.html;
    if (!html || !content.sources.every(({ url }) => safeEditorialLink(url))) throw new Error(`Invalid seed: ${entry.id}`);
    const note = content.figure && html.match(/<blockquote>\s*([\s\S]*?)<\/blockquote>/);
    const split = note?.index ?? html.indexOf('<h2');
    const endOfNote = split + (note ? note[0].length : 0);
    const laterSections = [...html.matchAll(/<h2\b/g)].map(match => match.index).filter(index => index > endOfNote);
    const extra = note ? laterSections.at(-1) ?? html.length : html.length;
    const visual = visuals[entry.id as keyof typeof visuals];
    if (split < 1) throw new Error(`Missing editorial sections: ${entry.id}`);
    return {
      slug: entry.id, position: order, published_at: date.toISOString().slice(0, 10),
      ...content, visual, leadHtml: html.slice(0, split), bodyHtml: html.slice(endOfNote, extra), extraHtml: html.slice(extra),
      ...(note ? { mapCaption: note[1].replace(/<[^>]*>/g, '') } : {}),
    };
  });
  return Response.json(articles);
}
