import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSquadScorers } from '../src/lib/bzzoiro.js';
import { mapAfTopScorers } from '../src/lib/football.js';
import { mergeScorerFallback, withScorerFallback, buildScorerMarkets, resolveMatchMarkets } from '../src/lib/probabilities.js';

test('mapSquadScorers acepta varias formas y solo trae goleadores con equipo', () => {
  const rows = mapSquadScorers({ squad: [
    { name: 'Delantero', goals: 4, appearances: 6 },
    { name: 'Portero', goals: 0 },
    { name: null, goals: 9 },
  ] }, { team: 'Andorra' });
  assert.deepEqual(rows, [{ player: 'Delantero', team: 'Andorra', value: 4, matches: 6 }]);
  assert.equal(mapSquadScorers({ squad: [{ name: 'Medio' }] }, { team: 'Andorra' }), null);
  assert.equal(mapSquadScorers(null, { team: 'Andorra' }), null);
});

test('mapAfTopScorers mapea la respuesta de topscorers a filas de leaderboard', () => {
  const rows = mapAfTopScorers({ response: [
    { player: { name: 'Kane' }, statistics: [{ team: { name: 'Inglaterra' }, goals: { total: 5 }, games: { appearences: 4 } }] },
    { player: { name: 'Sin goles' }, statistics: [{ team: { name: 'Malta' }, goals: { total: 0 } }] },
  ] });
  assert.deepEqual(rows, [{ player: 'Kane', team: 'Inglaterra', value: 5, matches: 4 }]);
  assert.equal(mapAfTopScorers({ response: [] }), null);
});

test('mergeScorerFallback da prioridad al leaderboard por equipo', () => {
  const base = { provider: 'Bzzoiro', scorers: [{ player: 'Base', team: 'Andorra', value: 3, matches: 4 }] };
  const fallback = { provider: 'Bzzoiro-squad', scorers: [
    { player: 'Squad-Andorra', team: 'Andorra', value: 1, matches: 2 },
    { player: 'Squad-Malta', team: 'Malta', value: 2, matches: 3 },
  ] };
  const merged = mergeScorerFallback(base, fallback);
  assert.deepEqual(merged.scorers.map(row => row.player), ['Base', 'Squad-Malta']);
  assert.equal(merged.fallbackSource, 'Bzzoiro-squad');
  assert.equal(mergeScorerFallback(base, null), base);
  assert.equal(mergeScorerFallback(base, { scorers: [] }), base);
});

test('withScorerFallback fusiona por competición sin tocar la base sin fallback', () => {
  const out = withScorerFallback(
    { nations: { scorers: [] } },
    { nations: { provider: 'Bzzoiro-squad', scorers: [{ player: 'Nueve', team: 'Malta', value: 2, matches: 3 }] } },
  );
  assert.equal(out.nations.scorers.length, 1);
  assert.equal(out.nations.fallbackSource, 'Bzzoiro-squad');
});

test('la cascada fallback ya no descarta goleadores y declara su fuente', () => {
  const match = { home: 'Andorra', away: 'Malta', competition: 'nations', modelPrediction: { xg: { home: 1.13, away: 1.09 } } };
  const scorers = { scorers: [{ player: 'Nueve', team: 'Andorra', value: 3, matches: 4 }] };
  const markets = resolveMatchMarkets({ match, results: [], scorers, standings: null });
  assert.ok(markets.firstGoal);
  assert.equal(markets.lambdaSource, 'Bzzoiro-xG');
  assert.equal(markets.firstGoalSource, 'Bzzoiro-xG');
  assert.equal(markets.hasScorers, true);
  assert.equal(markets.scorerSource, 'leaderboard');
  assert.ok(markets.scorers.home.length > 0);
});

test('buildScorerMarkets es null-honesto sin filas ni lambdas', () => {
  const empty = buildScorerMarkets({ match: { home: 'A', away: 'B' }, scorers: null, standings: null, raceLambdas: null, lambdaTotal: null });
  assert.equal(empty.hasScorers, false);
});
