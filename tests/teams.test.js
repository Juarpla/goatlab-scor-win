import test from 'node:test';
import assert from 'node:assert/strict';
import { heroMatch, teamShort, priorityIndex, nationsPriorityIndex } from '../src/lib/teams.js';

const match = (id, home, away, kickoff, status = 'NS') => ({ id, home, away, kickoff, status });

test('heroMatch prefers the priority list over kickoff time', () => {
  const hero = heroMatch([
    match('early', 'Leeds', 'Newcastle', '2026-09-14T19:00:00Z'),
    match('late', 'Villarreal', 'Real Betis', '2026-09-14T22:00:00Z'),
    match('top', 'Getafe', 'Real Madrid', '2026-09-14T23:00:00Z'),
  ]);
  assert.equal(hero.id, 'top');
});

test('heroMatch prefers nations ranking over earliest kickoff', () => {
  const hero = heroMatch([
    match('early', 'Andorra', 'Malta', '2026-09-24T16:00:00Z'),
    match('late', 'Netherlands', 'Germany', '2026-09-24T18:45:00Z'),
  ]);
  assert.equal(hero.id, 'late');
});

test('heroMatch prefers England-Spain over Portugal-Wales', () => {
  const hero = heroMatch([
    match('por-wal', 'Portugal', 'Wales', '2026-09-24T18:45:00Z'),
    match('eng-esp', 'England', 'Spain', '2026-09-26T18:45:00Z'),
  ]);
  assert.equal(hero.id, 'eng-esp');
});

test('heroMatch prefers clubs over nations', () => {
  const hero = heroMatch([
    match('por-wal', 'Portugal', 'Wales', '2026-09-24T18:45:00Z'),
    match('eng-esp', 'England', 'Spain', '2026-09-26T18:45:00Z'),
    match('bar-mal', 'Barcelona', 'Málaga', '2026-09-27T18:45:00Z'),
  ]);
  assert.equal(hero.id, 'bar-mal');
});

test('nationsPriorityIndex ranks top nations above minnows', () => {
  assert.ok(nationsPriorityIndex('Spain') < nationsPriorityIndex('Portugal'));
  assert.ok(nationsPriorityIndex('Portugal') < nationsPriorityIndex('Andorra'));
  assert.equal(nationsPriorityIndex('Andorra'), nationsPriorityIndex('Malta'));
  assert.equal(nationsPriorityIndex('Turkey'), nationsPriorityIndex('Türkiye'));
});

test('heroMatch breaks priority ties by earliest kickoff', () => {
  const hero = heroMatch([
    match('b', 'Southampton', 'Everton', '2026-09-14T21:00:00Z'),
    match('a', 'Fulham', 'Brighton', '2026-09-14T19:00:00Z'),
  ]);
  assert.equal(hero.id, 'a');
});

test('heroMatch excludes finished matches', () => {
  const hero = heroMatch([
    match('done', 'Barcelona', 'Sevilla', '2026-09-14T12:00:00Z', 'FT'),
    match('next', 'Leeds', 'Newcastle', '2026-09-14T19:00:00Z'),
  ]);
  assert.equal(hero.id, 'next');
});

test('heroMatch returns null with no candidates', () => {
  assert.equal(heroMatch([]), null);
  assert.equal(heroMatch([match('done', 'Barcelona', 'Sevilla', '2026-09-14T12:00:00Z', 'PEN')]), null);
});

test('priority order follows the agreed list', () => {
  assert.equal(priorityIndex('Barcelona'), 0);
  assert.equal(priorityIndex('Real Madrid'), 1);
  assert.ok(priorityIndex('Paris Saint-Germain') < priorityIndex('Arsenal'));
  assert.ok(priorityIndex('Arsenal') < priorityIndex('Leeds'));
  assert.equal(priorityIndex('Leeds'), priorityIndex('Villarreal'));
});

test('teamShort uses known abbreviations and falls back to three letters', () => {
  assert.equal(teamShort('Manchester City'), 'MCI');
  assert.equal(teamShort('Paris Saint-Germain'), 'PSG');
  assert.equal(teamShort('Getafe'), 'GET');
});
test('sameClub tolerates provider naming differences without cross-matching', async () => {
  const { sameClub } = await import('../src/lib/teams.js');
  assert.equal(sameClub('Leeds United', 'Leeds'), true);
  assert.equal(sameClub('Newcastle United FC', 'Newcastle'), true);
  assert.equal(sameClub('Paris Saint-Germain', 'Paris Saint Germain'), true);
  assert.equal(sameClub('Manchester United', 'Manchester City'), false);
  assert.equal(sameClub('Real Madrid', 'Real Betis'), false);
  assert.equal(sameClub('Brighton & Hove Albion', 'Brighton'), true);
  assert.equal(sameClub('', 'Leeds'), false);
});
