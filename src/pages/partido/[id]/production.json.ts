import {contentMatches, matchProduction} from '../../../lib/content-store.js';
export function getStaticPaths() {
  return contentMatches().map(match=>({params:{id:match.matchId},props:{match}}));
}
export function GET({props}) {
  return new Response(JSON.stringify(matchProduction(props.match)),{headers:{'Content-Type':'application/json; charset=utf-8'}});
}
