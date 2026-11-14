import fixtures from '../../public/data/fixtures.json';
import results from '../../public/data/results.json';
import ledger from '../../public/data/finished-at.json';
import archive from '../../public/data/match-archive.json';
import analyses from '../../public/data/llm-analysis.json';
import standings from '../../public/data/standings.json';
import scorers from '../../public/data/scorers.json';
import scorerFallback from '../../public/data/scorer-fallback.json';
import weather from '../../public/data/weather.json';
import { withScorerFallback } from './probabilities.js';
import { editorialMatch, pageReading } from './match-calendar.js';

export const analysisContext = { analyses, results: results.results, standings, scorers: withScorerFallback(scorers, scorerFallback), weather };
export { fixtures, archive, ledger };

export function editorialReading(match) {
  const entry = pageReading(match, analysisContext);
  return editorialMatch(match, entry) ? entry : null;
}
