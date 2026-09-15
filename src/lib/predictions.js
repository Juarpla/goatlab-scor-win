/** Independent Poisson baseline. Estimates are withheld until an external historical evaluation passes. */
export function goalDistribution(lambda, max = 20) {
  if (!Number.isFinite(lambda) || lambda < 0 || lambda > 8) throw new Error('Media de goles fuera de rango');
  const probabilities = [Math.exp(-lambda)];
  for (let k = 1; k <= max; k++) probabilities.push(probabilities[k - 1] * lambda / k);
  return probabilities;
}
export function predictGoals(homeLambda, awayLambda) {
  const home = goalDistribution(homeLambda), away = goalDistribution(awayLambda);
  let homeWin = 0, draw = 0, awayWin = 0, total = 0, overTwo = 0, bothScore = 0;
  const scores = [];
  for (let h = 0; h < home.length; h++) for (let a = 0; a < away.length; a++) {
    const p = home[h] * away[a]; total += p;
    if (h > a) homeWin += p; else if (h === a) draw += p; else awayWin += p;
    if (h + a >= 3) overTwo += p;
    if (h > 0 && a > 0) bothScore += p;
    scores.push({ home: h, away: a, probability: p });
  }
  return { homeWin: homeWin / total, draw: draw / total, awayWin: awayWin / total, threeOrMoreGoals: overTwo / total, bothScore: bothScore / total, scores: scores.sort((a,b) => b.probability-a.probability).slice(0,5).map(score => ({...score, probability: score.probability / total})), method: 'Poisson independiente', validated: false };
}
export function publishablePrediction(prediction, evaluation) {
  // No fabricated backtest: the caller must provide an independently produced evaluation.
  if (!evaluation || evaluation.modelVersion !== 'poisson-v1' || !Number.isInteger(evaluation.sampleSize) || evaluation.sampleSize < 200 || !Number.isFinite(evaluation.brierScore) || !Number.isFinite(evaluation.baselineBrierScore) || evaluation.brierScore < 0 || evaluation.brierScore >= evaluation.baselineBrierScore || !evaluation.evaluatedAt || Number.isNaN(Date.parse(evaluation.evaluatedAt))) return null;
  return { ...prediction, validated: true, evaluation };
}
