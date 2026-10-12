import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { CONTENT_CATEGORIES, contentUrl, validateContent } from './match-content.js';
import { esName } from './teams.js';

const read = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
export function contentMatches() {
  const matches = new Map((read('public/data/fixtures.json')?.matches ?? []).map(m => [m.webId ?? m.id, { ...m, matchId: m.webId ?? m.id, home: esName(m.home), away: esName(m.away) }]));
  const dir = 'public/data/youtube-scripts';
  if (existsSync(dir)) for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const data = read(`${dir}/${file}`);
    if (data?.matchId && !matches.has(data.matchId)) matches.set(data.matchId, data);
  }
  return [...matches.values()];
}
export function matchContent(match, category) {
  const data = read(`public/data/${CONTENT_CATEGORIES[category].directory}/${match.matchId}.json`);
  return validateContent(data, category, match.matchId) ? data : null;
}
export function contentIndex() {
  return { version: 1, matches: contentMatches().filter(m => m.status === 'NS' && Date.parse(m.kickoff) > Date.now()).map(match => ({
    matchId: match.matchId, home: match.home, away: match.away, competition: match.competition, kickoff: match.kickoff,
    content: Object.fromEntries(Object.keys(CONTENT_CATEGORIES).map(category => [category, { status: matchContent(match, category) ? 'ready' : 'pending', url: contentUrl(match.matchId, category), jsonUrl: contentUrl(match.matchId, category, true) }])),
  })).filter(m => m.content.scripts.status === 'ready') };
}
