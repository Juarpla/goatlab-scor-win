import {createHash} from 'node:crypto';
import {editingFacts} from './match-facts.js';
/** Deterministic facts independent of generated motion prompts. */
export function productionContext(match, {scorers, publication='pending', generatedAt=match.updatedAt??match.generatedAt??null}={}) {
  const context={version:1,matchId:match.matchId??match.webId??match.id,home:match.home,away:match.away,competition:match.competition??null,kickoff:match.kickoff??null,publication,facts:editingFacts(match,scorers),provenance:{source:'fixtures/scorers',generatedAt}};
  context.hash=createHash('sha256').update(JSON.stringify(context)).digest('hex');
  return context;
}
