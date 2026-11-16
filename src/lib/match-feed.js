import fixtures from '../../public/data/fixtures.json' with { type: 'json' };
import results from '../../public/data/results.json' with { type: 'json' };
import ledger from '../../public/data/finished-at.json' with { type: 'json' };
import archive from '../../public/data/match-archive.json' with { type: 'json' };
import analyses from '../../public/data/llm-analysis.json' with { type: 'json' };
import standings from '../../public/data/standings.json' with { type: 'json' };
import scorers from '../../public/data/scorers.json' with { type: 'json' };
import scorerFallback from '../../public/data/scorer-fallback.json' with { type: 'json' };
import weather from '../../public/data/weather.json' with { type: 'json' };
import { withScorerFallback } from './probabilities.js';
import { editorialMatch, pageReading } from './match-calendar.js';

export const analysisContext = { analyses, results: results.results, standings, scorers: withScorerFallback(scorers, scorerFallback), weather };
export { fixtures, archive, ledger };

export function editorialReading(match) {
  const entry = pageReading(match, analysisContext);
  return editorialMatch(match, entry) ? entry : null;
}
