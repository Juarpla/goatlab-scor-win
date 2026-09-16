import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensemble, estimateLambdas, teamRates, performanceIndex, formTilt, h2hTilt, drawBase,
  evaluateOneX2, evaluateBinary, oneX2Outcome, evaluationGate, publishableVerdict, predictGoals,
} from '../src/lib/predictions.js';

const results = [
  { date: '2026-08-01', home: 'Casa A', away: 'Rival B', homeScore: 2, awayScore: 1 },
  { date: '2026-08-08', home: 'Casa A', away: 'Rival C', homeScore: 1, awayScore: 0 },
  { date: '2026-08-15', home: 'Rival B', away: 'Casa A', homeScore: 0, awayScore: 2 },
  { date: '2026-08-22', home: 'Visita D', away: 'Rival C', homeScore: 1, awayScore: 3 },
  { date: '2026-08-29', home: 'Visita D', away: 'Casa A', homeScore: 0, awayScore: 1 },
  { date: '2026-09-05', home: 'Rival B', away: 'Visita D', homeScore: 1, awayScore: 1 },
];
const history = [
  { date: '2026-08-29', home: 'Visita D', away: 'Casa A', statistics: { home: { possession: 40, shotsOnTarget: 2, corners: 3, fouls: 12, yellowCards: 3, xg: 0.5 }, away: { possession: 60, shotsOnTarget: 6, corners: 8, fouls: 9, yellowCards: 1, xg: 1.8 } } },
  { date: '2026-09-05', home: 'Rival B', away: 'Visita D', statistics: { home: { possession: 45, shotsOnTarget: 3, corners: 4, fouls: 11, yellowCards: 2, xg: 0.9 }, away: { possession: 55, shotsOnTarget: 5, corners: 6, fouls: 10, yellowCards: 1, xg: 1.2 } } },
];
const homeForm = { played: 4, goalsFor: [2, 1, 2, 1], goalsAgainst: [1, 0, 0, 0], form: ['G', 'G', 'G', 'E'] };
const awayForm = { played: 4, goalsFor: [3, 0, 1, 1], goalsAgainst: [1, 1, 1, 1], form: ['G', 'P', 'E', 'E'] };
const catboost = { oneX2: { home: 0.34, draw: 0.30, away: 0.36 }, over25: 0.45, btts: 0.49, confidence: 0.62 };

test('estimateLambdas comes from recent goals with a home tilt, null without sample', () => {
  const lambdas = estimateLambdas(results, 'Casa A', 'Visita D');
  assert.ok(lambdas.home > 0 && lambdas.away > 0);
  assert.ok(lambdas.home > lambdas.away); // the sample favors the home side
  assert.equal(estimateLambdas([], 'Casa A', 'Visita D'), null);
});

test('teamRates averages goals for and against over the most recent matches', () => {
  const rates = teamRates(results, 'Casa A');
  assert.equal(rates.played, 4); // solo cuatro filas involucran a Casa A
  assert.equal(rates.gf, 1.5); // 2+1+2+1 en cuatro partidos
  const none = teamRates([], 'Casa A');
  assert.equal(none, null);
});

test('performanceIndex aggregates the multi-metric advantage, null-honest per metric', () => {
  // Casa A domina las métricas en tres partidos; Visita D aparece tres veces como la parte débil.
  const strong = { possession: 60, shotsOnTarget: 6, corners: 8, fouls: 8, yellowCards: 1, xg: 1.9 };
  const weak = { possession: 40, shotsOnTarget: 2, corners: 3, fouls: 12, yellowCards: 3, xg: 0.5 };
  const rows = [
    { date: '2026-08-15', home: 'Casa A', away: 'Otro E', statistics: { home: strong, away: weak } },
    { date: '2026-08-22', home: 'Casa A', away: 'Otro F', statistics: { home: strong, away: weak } },
    { date: '2026-08-29', home: 'Otro G', away: 'Casa A', statistics: { home: weak, away: strong } },
    { date: '2026-09-01', home: 'Visita D', away: 'Otro E', statistics: { home: weak, away: strong } },
    { date: '2026-09-05', home: 'Otro F', away: 'Visita D', statistics: { home: strong, away: weak } },
    { date: '2026-09-08', home: 'Visita D', away: 'Otro G', statistics: { home: weak, away: strong } },
  ];
  const index = performanceIndex(rows, 'Casa A', 'Visita D');
  assert.ok(index.advantage > 0 && index.advantage <= 1);
  assert.equal(index.means.possession > 0, true); // every metric tilts toward Casa A
  assert.equal(performanceIndex([], 'Casa A', 'Visita D').advantage, null);
});

test('formTilt and h2hTilt are bounded tilts, h2h requires three meetings', () => {
  const tilt = formTilt(homeForm, awayForm);
  assert.ok(tilt > 0 && tilt <= 1);
  assert.equal(formTilt(null, awayForm), null);
  assert.equal(h2hTilt({ totalMatches: 2, homeWins: 2, awayWins: 0 }), null);
  assert.equal(h2hTilt({ totalMatches: 10, homeWins: 6, awayWins: 1 }), 0.5);
});

test('drawBase uses the empirical share only with a real sample', () => {
  assert.equal(drawBase([]), 0.26);
  const sample = Array.from({ length: 40 }, (_, i) => ({ homeScore: i % 4 === 0 ? 1 : 2, awayScore: i % 4 === 0 ? 1 : 0 }));
  assert.equal(drawBase(sample), 0.25);
});

test('ensemble blends declared insumos, sums to one, and degrades honestly', () => {
  const verdict = ensemble({ results, history, h2h: { totalMatches: 10, homeWins: 6, awayWins: 1 }, catboost, home: 'Casa A', away: 'Visita D', homeForm, awayForm, unavailable: { home: 1, away: 0 } });
  const sum = verdict.oneX2.home + verdict.oneX2.draw + verdict.oneX2.away;
  assert.ok(Math.abs(sum - 1) < 0.01);
  assert.ok(verdict.oneX2.home > verdict.oneX2.away); // every insumo favors the home side here
  assert.ok(verdict.over25 > 0 && verdict.over25 < 1);
  assert.ok(verdict.btts > 0 && verdict.btts < 1);
  const labels = verdict.inputs.map(input => input.label);
  assert.ok(labels.includes('CatBoost (Bzzoiro)'));
  assert.ok(labels.includes('Poisson (GoatLab)'));
  assert.ok(labels.includes('Racha y forma'));
  assert.ok(labels.includes('Índice de rendimiento'));
  assert.ok(labels.includes('Historial cara a cara'));
  assert.ok(labels.includes('Localía y sede'));
  assert.ok(labels.includes('Ausencias confirmadas'));
  assert.ok(verdict.inputs.some(input => input.label === 'CatBoost (Bzzoiro)' && input.weight === 0.5));
  assert.equal(verdict.method, 'goatlab-ensemble-v1');

  // Without any insumo: null, never fabricated.
  assert.equal(ensemble({ results: [], history: [], home: 'X', away: 'Y' }), null);
  // Without CatBoost the Poisson carries the model weight and the digest says so.
  const fallback = ensemble({ results, history, home: 'Casa A', away: 'Visita D' });
  const cbRow = fallback.inputs.find(input => input.label === 'CatBoost (Bzzoiro)');
  assert.equal(cbRow.weight, 0);
  const poissonRow = fallback.inputs.find(input => input.label === 'Poisson (GoatLab)');
  assert.equal(poissonRow.weight, 0.8);
});

test('backtest evaluators compute Brier against the empirical baseline', () => {
  const metrics = evaluateOneX2([{ predicted: { home: 0.5, draw: 0.3, away: 0.2 }, outcome: 'home' }]);
  assert.equal(metrics, null); // minimum sample guard
  // El modelo acierta la clase por fila: Brier 0.08 contra el baseline constante 0.57.
  const rows = Array.from({ length: 40 }, (_, i) => i % 2 === 0
    ? { predicted: { home: 0.8, draw: 0.2, away: 0 }, outcome: 'home' }
    : { predicted: { home: 0, draw: 0.2, away: 0.8 }, outcome: 'away' });
  const oneX2 = evaluateOneX2(rows);
  assert.equal(oneX2.sampleSize, 40);
  assert.equal(oneX2.accuracy, 1);
  assert.ok(oneX2.brierScore < oneX2Baseline(rows)); // sharp model beats the constant baseline

  const binary = evaluateBinary(Array.from({ length: 40 }, (_, i) => ({ predicted: i % 2 ? 0.9 : 0.1, happened: i % 2 })));
  assert.equal(binary.sampleSize, 40);
  assert.equal(binary.accuracy, 1);
  assert.ok(binary.brierScore < binary.baselineBrierScore);
});

function oneX2Baseline(rows) { return evaluateOneX2(rows).baselineBrierScore; }

test('oneX2Outcome and the publication gate decide without favoritism', () => {
  assert.equal(oneX2Outcome(2, 1), 'home');
  assert.equal(oneX2Outcome(1, 1), 'draw');
  assert.equal(oneX2Outcome(0, 3), 'away');
  assert.equal(oneX2Outcome(null, 1), null);

  // 220 partidos, el modelo sigue el resultado real por fila: supera el baseline constante.
  const good = evaluateOneX2(Array.from({ length: 220 }, (_, i) => i % 5 === 0
    ? { predicted: { home: 0, draw: 0.9, away: 0.1 }, outcome: 'draw' }
    : { predicted: { home: 0.9, draw: 0.1, away: 0 }, outcome: 'home' }));
  const gate = evaluationGate({ poissonOneX2: good });
  assert.equal(gate.poissonOk, true);
  // Ensemble sample too small: nothing publishes yet.
  assert.equal(gate.published, false);
  const small = evaluationGate({ poissonOneX2: { sampleSize: 100, brierScore: 0.5, baselineBrierScore: 0.7 } });
  assert.equal(small.poissonOk, false);
});

test('publishableVerdict gates percentages behind the independent evaluation', () => {
  const verdict = ensemble({ results, home: 'Casa A', away: 'Visita D' });
  assert.equal(publishableVerdict(verdict, { modelVersion: 'goatlab-ensemble-v1', published: false }).published, false);
  assert.equal(publishableVerdict(verdict, { modelVersion: 'goatlab-ensemble-v1', published: true }).published, true);
  assert.equal(publishableVerdict(null, { modelVersion: 'goatlab-ensemble-v1', published: true }).published, false);
});
