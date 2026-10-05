import { contentMatches, matchContent } from '../../../lib/content-store.js';
import { CONTENT_CATEGORIES } from '../../../lib/match-content.js';
export function getStaticPaths() {
  return contentMatches().flatMap(match => Object.keys(CONTENT_CATEGORIES).map(category => ({ params: { id: match.matchId, category }, props: { match, category } })));
}
export function GET({ props }) {
  const { match, category } = props;
  const data = matchContent(match, category) ?? { version: 1, status: 'pending', category, matchId: match.matchId, home: match.home, away: match.away };
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
