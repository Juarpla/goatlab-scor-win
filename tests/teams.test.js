import test from 'node:test';
import assert from 'node:assert/strict';
import { heroMatch, rankMatches, contentRanking, teamShort, priorityIndex, nationsPriorityIndex } from '../src/lib/teams.js';

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

test('rankMatches orders clubs, then both-priority bonus, then kickoff', () => {
  const ranked = rankMatches([
    match('late-barca', 'Barcelona', 'Sevilla', '2026-09-15T20:00:00Z'),
    match('early-other', 'Leeds', 'Newcastle', '2026-09-14T19:00:00Z'),
    match('both', 'Arsenal', 'Chelsea', '2026-09-16T20:00:00Z'),
    match('madrid', 'Getafe', 'Real Madrid', '2026-09-14T23:00:00Z'),
    match('done', 'Liverpool', 'Chelsea', '2026-09-13T12:00:00Z', 'FT'),
  ]);
  assert.deepEqual(ranked.map(m => m.id), ['late-barca', 'madrid', 'both', 'early-other']);
  assert.equal(heroMatch(ranked).id, 'late-barca');
});

test('rankMatches breaks equal club priority by earliest kickoff', () => {
  const ranked = rankMatches([
    match('late', 'Barcelona', 'Sevilla', '2026-09-16T20:00:00Z'),
    match('early', 'Barcelona', 'Getafe', '2026-09-14T20:00:00Z'),
  ]);
  assert.deepEqual(ranked.map(m => m.id), ['early', 'late']);
});

test('rankMatches uses nation ranking when no priority club is playing', () => {
  const ranked = rankMatches([
    match('por', 'Portugal', 'Wales', '2026-09-24T18:45:00Z'),
    match('eng', 'England', 'Spain', '2026-09-26T18:45:00Z'),
  ]);
  assert.deepEqual(ranked.map(m => m.id), ['eng', 'por']);
});

const windowNow = Date.parse('2026-10-22T15:00:00Z');

test('nearest Barcelona and Madrid fixtures lead regardless of dates and legal prefixes', () => {
  const soon = index => `2026-10-22T${16 + index}:45:00Z`;
  const matches = [
    match('a', 'Sturm', 'Marseille', soon(0)),
    match('b', 'Union', 'Hapoel', soon(1)),
    match('c', 'OFI', 'Leverkusen', soon(2)),
    match('d', 'Lech', 'Sunderland', soon(3)),
    match('e', 'Juventus', 'Rennes', soon(4)),
    match('barca', 'FC Barcelona', 'Getafe CF', '2026-10-23T20:00:00Z'),
    match('classic', 'FC Barcelona', 'Real Madrid CF', '2026-10-25T20:00:00Z'),
  ];
  const { ranked, priorityCount } = contentRanking(matches, windowNow);
  assert.equal(priorityCount, 2);
  assert.equal(ranked[0].id, 'barca');
  assert.deepEqual(ranked.slice(2, 7).map(item => item.id), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(ranked[1].id, 'classic');
  assert.equal(rankMatches(matches)[0].id, 'a');
});

test('every listed club playing today or tomorrow stays ahead of the fill', () => {
  const tomorrow = '2026-10-23T20:00:00Z';
  const rows = [
    ['city', 'Aston Villa FC', 'Manchester City FC'],
    ['liv', 'Liverpool FC', 'Brighton & Hove Albion FC'],
    ['ars', 'Arsenal FC', 'Everton FC'],
    ['psg', 'Paris Saint-Germain', 'Lens'],
    ['mad', 'Getafe', 'Real Madrid CF'],
    ['barca', 'FC Barcelona', 'Sevilla'],
    ['derby', 'Chelsea FC', 'Tottenham Hotspur FC'],
  ];
  const matches = [
    match('early', 'Sturm', 'Marseille', '2026-10-22T16:45:00Z'),
    ...rows.map(([id, home, away]) => match(id, home, away, tomorrow)),
  ];
  const { ranked, priorityCount } = contentRanking(matches, windowNow);
  assert.equal(priorityCount, 7);
  assert.deepEqual(ranked.map(item => item.id), ['barca', 'mad', 'derby', 'psg', 'liv', 'ars', 'city', 'early']);
});

test('nations reserve the content slots only when no listed club plays in the window', () => {
  const neutral = contentRanking([
    match('early', 'Ipswich', 'Forest', '2026-10-22T19:00:00Z'),
    match('esp', 'Spain', 'Wales', '2026-10-23T19:00:00Z'),
  ], windowNow);
  assert.equal(neutral.priorityCount, 1);
  assert.equal(neutral.ranked[0].id, 'esp');
  const withClub = contentRanking([
    match('early', 'Ipswich', 'Forest', '2026-10-22T19:00:00Z'),
    match('esp', 'Spain', 'Wales', '2026-10-23T18:00:00Z'),
    match('ars', 'Arsenal FC', 'Everton', '2026-10-23T19:00:00Z'),
  ], windowNow);
  assert.equal(withClub.priorityCount, 1);
  assert.deepEqual(withClub.ranked.map(item => item.id), ['ars', 'early', 'esp']);
});

test('Espanyol does not inherit Barcelona priority', () => {
  const { ranked, priorityCount } = contentRanking([
    match('early', 'Sturm', 'Marseille', '2026-10-22T16:45:00Z'),
    match('espanyol', 'RCD Espanyol de Barcelona', 'Getafe', '2026-10-23T20:00:00Z'),
  ], windowNow);
  assert.equal(priorityCount, 0);
  assert.equal(ranked[0].id, 'early');
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
  assert.equal(sameClub('PAE AEK', 'AEK Athens'), true);
  assert.equal(sameClub('', 'Leeds'), false);
});
