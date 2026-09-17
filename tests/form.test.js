import test from 'node:test';
import assert from 'node:assert/strict';
import { teamForm, matchForm, bakedForm } from '../src/lib/form.js';

const results = [
  { id: '1', date: '2026-09-01', competition: 'premier', home: 'Arsenal', away: 'Chelsea', homeScore: 2, awayScore: 0 },
  { id: '2', date: '2026-09-05', competition: 'premier', home: 'Liverpool', away: 'Arsenal', homeScore: 1, awayScore: 1 },
  { id: '3', date: '2026-09-08', competition: 'premier', home: 'Arsenal', away: 'Everton', homeScore: 0, awayScore: 3 },
  { id: '4', date: '2026-09-09', competition: 'premier', home: 'Chelsea', away: 'Brentford', homeScore: 3, awayScore: 1 },
  { id: '5', date: '2026-09-11', competition: 'champions', home: 'Arsenal', away: 'Porto', homeScore: 4, awayScore: 1 },
  { id: '6', date: '2026-09-13', competition: 'premier', home: 'Brighton', away: 'Arsenal', homeScore: 2, awayScore: 2 },
  { id: '7', date: '2026-09-13', competition: 'premier', home: 'Chelsea', away: 'Leeds', homeScore: 1, awayScore: 0 },
  { id: '8', date: '2026-09-13', competition: 'premier', home: 'Fulham', away: 'Everton', homeScore: null, awayScore: null },
];

test('teamForm computes newest-first goals and G/E/P letters across competitions', () => {
  const form = teamForm(results, 'Arsenal');
  assert.deepEqual(form.form, ['E', 'G', 'P', 'E', 'G']); // newest first
  assert.deepEqual(form.goalsFor, [2, 4, 0, 1, 2]);
  assert.deepEqual(form.goalsAgainst, [2, 1, 3, 1, 0]);
  assert.equal(form.played, 5);
});

test('teamForm ignores unplayed fixtures and caps at count', () => {
  const form = teamForm(results, 'Chelsea', 3);
  assert.equal(form.played, 3);
  assert.deepEqual(form.form, ['G', 'G', 'P']); // newest first
});

test('teamForm returns null below three played matches', () => {
  assert.equal(teamForm(results, 'Leeds'), null);
  assert.equal(teamForm(results, 'Fulham'), null); // only an unplayed fixture
  assert.equal(teamForm([], 'Arsenal'), null);
});

test('matchForm returns both sides or null when one lacks data', () => {
  const both = matchForm(results, 'Arsenal', 'Chelsea');
  assert.equal(both.homeForm.played, 5);
  assert.equal(both.awayForm.played, 3);
  assert.equal(matchForm(results, 'Arsenal', 'Leeds'), null);
});

test('bakedForm keeps the teamForm shape with no minimum sample', () => {
  const rows = [
    { eventId: 1, date: '2026-09-13T18:45:00+00:00', home: 'Sassuolo', away: 'Juventus', homeTeamId: 61, awayTeamId: 73, homeScore: 3, awayScore: 2 },
    { eventId: 2, date: '2026-09-06T18:45:00+00:00', home: 'Juventus', away: 'Inter', homeTeamId: 73, awayTeamId: 60, homeScore: 1, awayScore: 1 },
  ];
  const form = bakedForm(rows, 'Juventus');
  assert.equal(form.played, 2); // two matches are enough here (no 3-match floor)
  assert.deepEqual(form.form, ['P', 'E']); // newest first
  assert.deepEqual(form.goalsFor, [2, 1]);
  assert.deepEqual(form.goalsAgainst, [3, 1]);
  assert.deepEqual(form.rivals, ['Sassuolo', 'Inter']);
  assert.equal(bakedForm(rows, 'Barcelona'), null);
  assert.equal(bakedForm([], 'Juventus'), null);
  assert.equal(bakedForm(null, 'Juventus'), null);
});
