import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, roundNumber, findStandingRow, topScorerFor } from '../src/lib/series-crumbs.js';

const standings = {
  europa: {
    rows: [
      { position: 20, team: 'Levski Sofia', teamId: 348, played: 0, points: 0 },
      { position: 12, team: 'Beşiktaş JK', teamId: 196, played: 0, points: 0 },
      { position: 16, team: 'FC Viktoria Plzeň', teamId: 144, played: 0, points: 0 },
      { position: 4, team: 'Real Betis', teamId: 56, played: 1, points: 3 },
    ],
  },
};
const scorers = {
  europa: {
    scorers: [
      { rank: 3, player: 'Haris Tabaković', team: 'Red Bull Salzburg', teamId: 147, value: 5, matches: 4 },
      { rank: 33, player: 'Taxiarchis Fountas', team: 'OFI Crete', teamId: 332, value: 2, matches: 2 },
    ],
  },
};

test('normalizeName quita tildes y ruido para casar fuentes', () => {
  assert.equal(normalizeName('Beşiktaş JK'), 'besiktas jk');
  assert.equal(normalizeName('  OFI Crete!! '), 'ofi crete');
});

test('roundNumber extracts the matchday and skips rounds without a number', () => {
  assert.equal(roundNumber('League Stage - 1'), 1);
  assert.equal(roundNumber('Regular Season - 6'), 6);
  assert.equal(roundNumber(5), 5);
  assert.equal(roundNumber('Quarter-finals'), null);
  assert.equal(roundNumber(null), null);
});

test('findStandingRow enlaza por teamId aunque el nombre no case', () => {
  assert.deepEqual(findStandingRow(standings, 'europa', { teamId: 348, names: ['Levski'] }), { position: 20, played: 0 });
  assert.deepEqual(findStandingRow(standings, 'europa', { teamId: 144, names: ['Plzen'] }), { position: 16, played: 0 });
});

test('findStandingRow cae al nombre con tildes y parciales', () => {
  assert.deepEqual(findStandingRow(standings, 'europa', { teamId: null, names: ['Besiktas'] }), { position: 12, played: 0 });
  assert.deepEqual(findStandingRow(standings, 'europa', { teamId: null, names: ['Real Betis Balompié'] }), { position: 4, played: 1 });
});

test('findStandingRow returns null without a row (OFI) or without a competition', () => {
  assert.equal(findStandingRow(standings, 'europa', { teamId: null, names: ['OFI'] }), null);
  assert.equal(findStandingRow(standings, 'copa', { teamId: 348, names: ['Levski'] }), null);
  assert.equal(findStandingRow(null, 'europa', { teamId: 348, names: [] }), null);
});

test('topScorerFor rescata al goleador por teamId o nombre', () => {
  assert.deepEqual(
    topScorerFor(scorers, 'europa', { teamId: 147, names: ['Salzburg'] }),
    { player: 'Haris Tabaković', value: 5, matches: 4 },
  );
  assert.deepEqual(
    topScorerFor(scorers, 'europa', { teamId: null, names: ['OFI Crete'] }),
    { player: 'Taxiarchis Fountas', value: 2, matches: 2 },
  );
  assert.equal(topScorerFor(scorers, 'europa', { teamId: null, names: ['Lillestrom'] }), null);
});
