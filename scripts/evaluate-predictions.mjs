/**
 * Evaluación histórica del veredicto GoatLab (backtest sin fuga temporal).
 * - Poisson: para cada partido del histórico, λ estimado solo con resultados
 *   anteriores; se compara contra el baseline empírico de la muestra.
 * - Ensemble: se evalúan las capturas pre-partido guardadas en predictions.json
 *   (catboost del proveedor + veredicto GoatLab calculado al momento).
 * Escribe public/data/evaluation-report.json. El gate de publicación vive en
 * predictions.js (evaluationGate): ninguna corrida publica porcentajes por sí sola.
 */
import { writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import {
  estimateLambdas, predictGoals, evaluateOneX2, evaluateBinary,
  oneX2Outcome, evaluationGate,
} from '../src/lib/predictions.js';
import { sameClub } from '../src/lib/teams.js';
import { STAT_METRICS, forecastStats, leagueAverage } from '../src/lib/stats-forecast.js';

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

const evaluatedAt = new Date().toISOString();

/* ---- Backtest Poisson rodante contra la base de resultados ---- */

const base = await readJson('public/data/results.json');
const results = (base?.results ?? []).filter(row => row.homeScore != null && row.awayScore != null).sort((a, b) => (a.date < b.date ? -1 : 1));
const poisson1x2 = [];
const poissonOver = [];
const poissonBtts = [];
for (let index = 0; index < results.length; index++) {
  const row = results[index];
  const prior = results.slice(0, index).filter(candidate => candidate.date < row.date);
  const played = team => prior.filter(candidate => sameClub(candidate.home, team) || sameClub(candidate.away, team));
  if (played(row.home).length < 3 || played(row.away).length < 3) continue;
  const lambdas = estimateLambdas(prior, row.home, row.away);
  if (!lambdas) continue;
  const prediction = predictGoals(lambdas.home, lambdas.away);
  const outcome = oneX2Outcome(row.homeScore, row.awayScore);
  if (outcome) poisson1x2.push({ predicted: { home: prediction.homeWin, draw: prediction.draw, away: prediction.awayWin }, outcome });
  poissonOver.push({ predicted: prediction.threeOrMoreGoals, happened: row.homeScore + row.awayScore >= 3 ? 1 : 0 });
  poissonBtts.push({ predicted: prediction.bothScore, happened: row.homeScore > 0 && row.awayScore > 0 ? 1 : 0 });
}

/* ---- Muestra del ensemble: capturas pre-partido con marcador final conocido ---- */

const captured = await readJson('public/data/predictions.json');
const ensemble1x2 = [];
const ensembleOver = [];
const ensembleBtts = [];
let ensembleCaptures = 0;
for (const entry of Object.values(captured?.captures ?? {})) {
  if (!entry?.finalScore || !entry?.captures?.length) continue;
  const preKick = entry.captures
    .filter(capture => capture.capturedAt && entry.kickoff && capture.capturedAt <= entry.kickoff)
    .sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : 1));
  const capture = preKick[preKick.length - 1] ?? entry.captures[entry.captures.length - 1];
  ensembleCaptures += 1;
  const probabilities = capture.goatlab ?? capture.catboost;
  if (probabilities?.oneX2?.home != null && probabilities.oneX2.draw != null && probabilities.oneX2.away != null) {
    const outcome = oneX2Outcome(entry.finalScore.home, entry.finalScore.away);
    if (outcome) ensemble1x2.push({ predicted: { home: probabilities.oneX2.home, draw: probabilities.oneX2.draw, away: probabilities.oneX2.away }, outcome });
  }
  if (probabilities?.over25 != null) ensembleOver.push({ predicted: probabilities.over25, happened: entry.finalScore.home + entry.finalScore.away >= 3 ? 1 : 0 });
  if (probabilities?.btts != null) ensembleBtts.push({ predicted: probabilities.btts, happened: entry.finalScore.home > 0 && entry.finalScore.away > 0 ? 1 : 0 });
}

/* ---- Backtest del pronóstico de estadísticas (rodante, sin fuga) ---- */

const statRows = ((await readJson('public/data/history-stats.json'))?.rows ?? [])
  .filter(row => row?.statistics)
  .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
const statErrors = Object.fromEntries(STAT_METRICS.map(metric => [metric, { sum: 0, base: 0, n: 0 }]));
for (let index = 0; index < statRows.length; index++) {
  const row = statRows[index];
  const prior = statRows.slice(0, index).filter(candidate => candidate.date < row.date);
  if (!prior.length) continue;
  const forecast = forecastStats(prior, row.home, row.away, { competition: row.competition });
  if (!forecast) continue;
  for (const metric of STAT_METRICS) {
    for (const side of ['home', 'away']) {
      const predicted = forecast[side]?.[metric];
      const actual = row.statistics?.[side]?.[metric];
      if (predicted == null || actual == null) continue;
      // Posesión se evalúa como reparto: el error de un lado duplica al otro.
      if (metric === 'possession' && side === 'away') continue;
      const baseline = leagueAverage(prior, row.competition, metric) ?? leagueAverage(prior, null, metric);
      if (baseline == null) continue;
      const bucket = statErrors[metric];
      bucket.sum += Math.abs(predicted - actual);
      bucket.base += Math.abs(baseline - actual);
      bucket.n += 1;
    }
  }
}
const STAT_MIN_SAMPLE = 30;
const statsMetrics = Object.fromEntries(Object.entries(statErrors).map(([metric, bucket]) => {
  if (!bucket.n) return [metric, { sampleSize: 0, mae: null, baselineMae: null, published: false }];
  const mae = bucket.sum / bucket.n;
  const baselineMae = bucket.base / bucket.n;
  return [metric, {
    sampleSize: bucket.n,
    mae: Math.round(mae * 1000) / 1000,
    baselineMae: Math.round(baselineMae * 1000) / 1000,
    published: bucket.n >= STAT_MIN_SAMPLE && mae < baselineMae,
  }];
}));

/* ---- Métricas y gate de publicación ---- */

const poissonOneX2 = evaluateOneX2(poisson1x2);
const poissonOver25 = evaluateBinary(poissonOver);
const poissonBttsMetrics = evaluateBinary(poissonBtts);
const ensembleOneX2 = evaluateOneX2(ensemble1x2);
const ensembleOverMetrics = evaluateBinary(ensembleOver);
const ensembleBttsMetrics = evaluateBinary(ensembleBtts);
const gate = evaluationGate({ poissonOneX2, ensembleOneX2, ensembleOver25: ensembleOverMetrics, ensembleBtts: ensembleBttsMetrics });

const reasons = [];
if (!poissonOneX2) reasons.push(`Muestra Poisson insuficiente (${poisson1x2.length} < 200).`);
else if (!gate.poissonOk) reasons.push('Poisson no supera al baseline empírico de la muestra.');
if (gate.poissonOk && !ensembleOneX2) reasons.push(`Muestra del ensemble insuficiente (${ensemble1x2.length} < 100); se acumulan capturas pre-partido.`);
else if (gate.poissonOk && ensembleOneX2 && !gate.published) reasons.push('El ensemble no supera el gate en alguno de sus mercados.');
if (!reasons.length) reasons.push('Gate superado: los porcentajes pueden mostrarse en las páginas de partido.');

const evaluation = {
  modelVersion: 'goatlab-ensemble-v1',
  published: gate.poissonOk && gate.published,
  gate: { poissonOk: gate.poissonOk, reasons },
  poisson: {
    oneX2: poissonOneX2,
    over25: poissonOver25,
    btts: poissonBttsMetrics,
  },
  ensemble: {
    oneX2: ensembleOneX2,
    over25: ensembleOverMetrics,
    btts: ensembleBttsMetrics,
    captures: ensembleCaptures,
    note: 'El blend se evalúa con capturas pre-partido acumuladas en corridas programadas.',
  },
  stats: {
    method: 'stats-ratings-v1',
    metrics: statsMetrics,
    note: 'Cada métrica se publica solo con muestra ≥ 30 y MAE mejor que la media de su competición.',
  },
  methodology: {
    source: 'results.json (resultados reales de proveedores) y predictions.json (capturas pre-partido).',
    leakPolicy: 'Para cada partido se usan únicamente resultados anteriores a su fecha.',
    baselines: 'Distribución empírica de la muestra evaluada.',
    thresholds: '1X2: muestra ≥ 200 y Brier < baseline. Ensemble: muestra ≥ 100 por mercado. Stats: muestra ≥ 30 y MAE < media de la competición.',
  },
  evaluatedAt,
};
await writeFile('public/data/evaluation-report.json', JSON.stringify(evaluation, null, 2));
console.log(`evaluation: Poisson 1X2 n=${poissonOneX2?.sampleSize ?? 0} · ensemble n=${ensembleOneX2?.sampleSize ?? 0} · published=${evaluation.published}`);
