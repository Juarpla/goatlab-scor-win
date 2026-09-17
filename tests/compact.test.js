import test from 'node:test';
import assert from 'node:assert/strict';
import { toCompactInput, lastResults, COMPACT_MAX_CHARS } from '../src/lib/compact.js';

const match = {
  id: 'fd-1', home: 'FC Barcelona', away: 'Real Madrid CF',
  competition: 'laliga', kickoff: '2026-09-18T19:00:00Z', status: 'NS',
  h2h: { totalMatches: 10, homeWins: 4, draws: 3, awayWins: 3, avgTotalGoals: 2.8, recent: [{ date: '2026-01-01', home: 'A', away: 'B', homeScore: 1, awayScore: 1 }] },
  modelPrediction: { oneX2: { home: 0.5, draw: 0.25, away: 0.25 }, xg: { home: 1.6, away: 1.1 }, over25: 0.5, btts: 0.5, score: '2-1', cornersOver95: 0.4 },
};
const markets = { lambdas: { home: 1.61, away: 1.16 }, markets: { oneX2: { home: 0.5, draw: 0.27, away: 0.23 }, totals: { over25: 0.5 }, btts: { yes: 0.53 } } };
const results = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, date: `2026-09-0${i + 1}`, home: 'FC Barcelona', away: 'Girona FC', homeScore: 2, awayScore: 0 }));
const standings = { laliga: { rows: [{ position: 1, team: 'FC Barcelona', played: 5, points: 15, goalsFor: 21, goalsAgainst: 4 }] } };
const scorers = { laliga: { scorers: [{ player: 'Lewandowski', team: 'FC Barcelona', value: 5, matches: 5 }] } };

test('compacto incluye bloques M/P/B/T/S/R y es determinista', () => {
  const a = toCompactInput(match, markets, { results, standings, scorers });
  const b = toCompactInput(match, markets, { results, standings, scorers });
  assert.equal(a, b);
  assert.ok(a.startsWith('M|fd-1|'));
  assert.ok(a.includes('\nP|1.61|1.16|'));
  assert.ok(a.includes('\nB|0.5|0.25|0.25|'));
  assert.ok(a.includes('\nT|1|'));
  assert.ok(!a.includes('{') && !a.includes('"'));
});

test('lastResults respeta tope de 6 y trunca a 6000 caracteres', () => {
  assert.equal(lastResults(results, 'FC Barcelona').length, 6);
  const big = Array.from({ length: 500 }, (_, i) => ({ id: `x${i}`, date: '2026-09-01', home: 'FC Barcelona', away: 'Equipo Muy Largo Con Nombre Extenso Para Rellenar Caracteres Extra', homeScore: 1, awayScore: 0 }));
  const out = toCompactInput(match, markets, { results: big, standings, scorers });
  assert.ok(out.length <= COMPACT_MAX_CHARS);
});

test('sin mercados ni predicción omite bloques P/B sin romper', () => {
  const out = toCompactInput({ ...match, modelPrediction: null, h2h: null }, null, { results: [], standings: null, scorers: null });
  assert.ok(out.startsWith('M|'));
  assert.ok(!out.includes('\nP|') && !out.includes('\nB|'));
});
