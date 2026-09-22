import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAT_METRICS, teamStatRows, leagueAverage, forecastCount, forecastStats, forecastStatsFull,
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

test('forecastStatsFull fills all 9 from a single match per side', () => {
  const history = [
    row('2026-09-01', 'Portugal', 'Leeds', full, thin),
    row('2026-09-02', 'Wales', 'Everton', thin, full),
  ];
  const forecast = forecastStatsFull(history, 'Portugal', 'Wales', { competition: 'nations' });
  assert.equal(forecast.method, 'stats-ratings-v2');
  for (const metric of STAT_METRICS) {
    assert.ok(forecast.home[metric] != null, `home ${metric}`);
    assert.ok(forecast.away[metric] != null, `away ${metric}`);
  }
  assert.ok(Math.abs(forecast.home.possession + forecast.away.possession - 100) < 0.02);
  assert.equal(forecast.shortSample, true);
  assert.ok(forecast.origins.includes('Bzzoiro'));
});

test('forecastStatsFull falls back to the league average without team rows', () => {
  const history = [row('2026-09-01', 'Arsenal', 'Leeds', full, thin, 'nations')];
  const forecast = forecastStatsFull(history, 'Portugal', 'Wales', { competition: 'nations' });
  assert.ok(forecast.home.shots != null && forecast.away.shots != null);
  assert.equal(forecast.sources.home.shots, 'media');
  assert.ok(Math.abs(forecast.home.possession + forecast.away.possession - 100) < 0.02);
});

test('forecastStatsFull fills gaps with AF averages', () => {
  const noReds = side => ({ ...side, redCards: null });
  const history = [
    row('2026-09-01', 'Portugal', 'Leeds', noReds(full), noReds(thin)),
    row('2026-09-02', 'Wales', 'Everton', noReds(thin), noReds(full)),
  ];
  const withoutAf = forecastStatsFull(history, 'Portugal', 'Wales', { competition: 'nations' });
  assert.equal(withoutAf.home.redCards, null);
  const af = { home: [{ redCards: 0.2 }], away: [{ redCards: 0.1 }] };
  const withAf = forecastStatsFull(history, 'Portugal', 'Wales', { competition: 'nations', af });
  assert.ok(withAf.home.redCards != null && withAf.away.redCards != null);
  assert.equal(withAf.sources.home.redCards, 'AF');
});

test('forecastStatsFull anchors xG to the provider model', () => {
  const history = [
    row('2026-09-01', 'Portugal', 'Leeds', full, thin),
    row('2026-09-02', 'Wales', 'Everton', thin, full),
  ];
  const forecast = forecastStatsFull(history, 'Portugal', 'Wales', {
    competition: 'nations', providerXg: { home: 1.82, away: 0.99 },
  });
  assert.equal(forecast.home.xg, 1.82);
  assert.equal(forecast.away.xg, 0.99);
  assert.equal(forecast.xgSource, 'Bzzoiro');
});

test('forecastStatsFull keeps shots on target within total shots', () => {
  const wild = { possession: 55, shots: 2, shotsOnTarget: 5, xg: 1.8, corners: 6, fouls: 10, yellowCards: 2, redCards: 0, offsides: 2 };
  const history = [
    row('2026-09-01', 'Portugal', 'Leeds', wild, thin),
    row('2026-09-02', 'Wales', 'Everton', wild, thin),
  ];
  const forecast = forecastStatsFull(history, 'Portugal', 'Wales', { competition: 'nations' });
  assert.ok(forecast.home.shotsOnTarget <= forecast.home.shots);
  assert.ok(forecast.away.shotsOnTarget <= forecast.away.shots);
});

test('forecastStatsFull stays null in a total vacuum', () => {
  assert.equal(forecastStatsFull([], 'Portugal', 'Wales'), null);
});

test('muchas amarillas sin dato de rojas pronostican al menos una', () => {
  const dirty = { possession: 55, shots: 14, shotsOnTarget: 5, xg: 1.8, corners: 6, fouls: 16, yellowCards: 5, redCards: null, offsides: 2 };
  const history = [
    row('2026-09-01', 'Portugal', 'Leeds', dirty, dirty),
    row('2026-09-02', 'Wales', 'Everton', dirty, dirty),
  ];
  const forecast = forecastStatsFull(history, 'Portugal', 'Wales', { competition: 'nations' });
  assert.ok(forecast.home.yellowCards >= 3.5);
  assert.equal(forecast.home.redCards, 1);
  assert.equal(forecast.away.redCards, 1);
  assert.equal(forecast.sources.home.redCards, 'regla');
  assert.ok(forecast.origins.includes('regla'));
});

test('el criterio no pisa el dato AF de rojas', () => {
  const dirty = { possession: 55, shots: 14, shotsOnTarget: 5, xg: 1.8, corners: 6, fouls: 16, yellowCards: 5, redCards: null, offsides: 2 };
  const history = [
    row('2026-09-01', 'Portugal', 'Leeds', dirty, dirty),
    row('2026-09-02', 'Wales', 'Everton', dirty, dirty),
  ];
  const af = { home: [{ redCards: 0.2 }], away: [{ redCards: 0.1 }] };
  const forecast = forecastStatsFull(history, 'Portugal', 'Wales', { competition: 'nations', af });
  assert.equal(forecast.home.redCards, 0.2);
  assert.equal(forecast.sources.home.redCards, 'AF');
});

test('el criterio no pisa la medición Bzzoiro de rojas', () => {
  const dirtyMeasured = { possession: 55, shots: 14, shotsOnTarget: 5, xg: 1.8, corners: 6, fouls: 16, yellowCards: 5, redCards: 0, offsides: 2 };
  const history = [
    row('2026-09-01', 'Portugal', 'Leeds', dirtyMeasured, dirtyMeasured),
    row('2026-09-02', 'Wales', 'Everton', dirtyMeasured, dirtyMeasured),
  ];
  const forecast = forecastStatsFull(history, 'Portugal', 'Wales', { competition: 'nations' });
  assert.equal(forecast.home.redCards, 0);
  assert.equal(forecast.sources.home.redCards, 'Bzzoiro');
});

test('amarillas normales sin dato de rojas quedan en null honesto', () => {
  const noReds = side => ({ ...side, redCards: null });
  const history = [
    row('2026-09-01', 'Portugal', 'Leeds', noReds(full), noReds(thin)),
    row('2026-09-02', 'Wales', 'Everton', noReds(thin), noReds(full)),
  ];
  const forecast = forecastStatsFull(history, 'Portugal', 'Wales', { competition: 'nations' });
  assert.ok(forecast.home.yellowCards < 3.5);
  assert.equal(forecast.home.redCards, null);
});
