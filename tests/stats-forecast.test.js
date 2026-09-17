import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAT_METRICS, teamStatRows, leagueAverage, forecastCount, forecastStats,
  threeWay, lastGoal, raceTo, cornerMargin, forecastDominance,
} from '../src/lib/stats-forecast.js';

const stats = values => ({ home: values[0], away: values[1] });
const row = (date, home, away, homeStats, awayStats, competition = 'premier') => ({
  date, competition, home, away, homeScore: 1, awayScore: 0,
  statistics: { home: homeStats, away: awayStats },
});
const full = { possession: 55, shots: 14, shotsOnTarget: 5, xg: 1.8, corners: 6, fouls: 10, yellowCards: 2, redCards: 0, offsides: 2 };
const thin = { possession: 45, shots: 9, shotsOnTarget: 3, xg: 1.1, corners: 4, fouls: 12, yellowCards: 1, redCards: 0, offsides: 1 };

test('forecastStats needs rows on both sides', () => {
  assert.equal(forecastStats([], 'Arsenal', 'Chelsea'), null);
  const history = [row('2026-09-01', 'Arsenal', 'Leeds', full, thin)];
  assert.equal(forecastStats(history, 'Arsenal', 'Chelsea'), null);
});

test('forecastStats covers the 9 metrics and possession sums to 100', () => {
const weak = { possession: 40, shots: 5, shotsOnTarget: 2, xg: 0.7, corners: 3, fouls: 13, yellowCards: 2, redCards: 0, offsides: 1 };
  const history = [];
  for (let i = 1; i <= 6; i++) {
    history.push(row(`2026-09-${String(i).padStart(2, '0')}`, 'Arsenal', `Rival${i}`, full, thin));
    history.push(row(`2026-09-${String(i + 10).padStart(2, '0')}`, 'Chelsea', `Otro${i}`, thin, weak));
  }
  const forecast = forecastStats(history, 'Arsenal', 'Chelsea', { competition: 'premier' });
  assert.equal(forecast.method, 'stats-ratings-v1');
  for (const metric of STAT_METRICS) {
    assert.ok(forecast.home[metric] != null, `home ${metric}`);
    assert.ok(forecast.away[metric] != null, `away ${metric}`);
  }
  assert.ok(Math.abs(forecast.home.possession + forecast.away.possession - 100) < 0.02);
  assert.equal(forecast.sample.home, 6);
  assert.ok(forecast.home.shots > forecast.away.shots);
});

test('short samples collapse to null per metric', () => {
  const history = [
    row('2026-09-01', 'Arsenal', 'Leeds', full, thin),
    row('2026-09-02', 'Arsenal', 'Everton', full, thin),
    row('2026-09-01', 'Chelsea', 'Leeds', full, thin),
    row('2026-09-02', 'Chelsea', 'Everton', full, thin),
  ];
  const forecast = forecastStats(history, 'Arsenal', 'Chelsea', { min: 3 });
  assert.equal(forecast.home.shots, null);
  assert.equal(forecast.home.possession, null);
});

test('forecastCount shrinks to the league average with thin samples', () => {
  const hot = forecastCount({ ownRows: [30, 30, 30], oppRows: [30, 30, 30], leagueAvg: 10, shrink: 4 });
  assert.ok(hot < 30 && hot > 10);
});

test('leagueAverage scopes by competition with global fallback', () => {
  const history = [row('2026-09-01', 'A', 'B', full, thin, 'premier')];
  assert.equal(leagueAverage(history, 'premier', 'shots'), 11.5);
  assert.equal(leagueAverage(history, 'laliga', 'shots'), null);
});

test('teamStatRows takes the most recent first', () => {
  const history = [
    row('2026-09-01', 'Arsenal', 'Leeds', full, thin),
    row('2026-09-10', 'Arsenal', 'Everton', full, thin),
  ];
  assert.equal(teamStatRows(history, 'Arsenal', 10)[0].date, '2026-09-10');
});

test('threeWay splits sum to one and symmetric rates draw even', () => {
  const duel = threeWay(5.5, 5.5);
  assert.ok(Math.abs(duel.home + duel.draw + duel.away - 1) < 0.01);
  assert.ok(Math.abs(duel.home - duel.away) < 0.001);
  assert.equal(threeWay(null, 5), null);
});

test('lastGoal matches the no-goal mass and sums to one', () => {
  const last = lastGoal(1.4, 1.1);
  assert.ok(Math.abs(last.home + last.away + last.noGoal - 1) < 0.02);
  assert.ok(Math.abs(last.noGoal - Math.exp(-2.5)) < 0.02);
  assert.ok(last.home > last.away);
});

test('raceTo is a fair coin on even rates and sums to one', () => {
  const race = raceTo(5, 5, 5);
  assert.ok(Math.abs(race.home - 0.5) < 0.001);
  assert.ok(Math.abs(race.away - 0.5) < 0.001);
  assert.equal(raceTo(0, 5, 3), null);
});

test('cornerMargin bands cover the whole mass', () => {
  const margin = cornerMargin(6, 4);
  const total = margin.home3plus + margin.home12 + margin.level + margin.away12 + margin.away3plus;
  assert.ok(Math.abs(total - 1) < 0.02);
  assert.ok(margin.home3plus + margin.home12 > margin.away12 + margin.away3plus);
});

test('forecastDominance stays null-honest without inputs', () => {
  assert.equal(forecastDominance({}), null);
  const full = forecastDominance({ corners: { home: 6, away: 4 }, yellows: { home: 1.8, away: 2.2 }, goalLambdas: { home: 1.6, away: 1.2 } });
  assert.equal(full.method, 'dominance-v1');
  assert.ok(full.cornersDuel.home > full.cornersDuel.away);
  assert.ok(full.cornerRace[5].home > 0.5);
});
