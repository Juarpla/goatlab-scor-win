import test from 'node:test';
import assert from 'node:assert/strict';
import { buildYoutubeScripts, selectMatches, staleScripts, sameCore } from '../src/lib/youtube.js';
import { checkScript, checkDescription } from '../src/lib/compliance.js';

const match = {
  id: 'bz-212589',
  webId: 'andorra-vs-malta-2026-09-24',
  competition: 'nations',
  home: 'Andorra',
  away: 'Malta',
  h2h: { totalMatches: 4, homeWins: 0, draws: 2, awayWins: 2, avgTotalGoals: 1.25 },
  lastMatches: {
    home: [
      { date: '2024-09-10T18:45:00+00:00', home: 'Andorra', away: 'Malta', homeScore: 0, awayScore: 1 },
      { date: '2020-11-14T14:00:00+00:00', home: 'Malta', away: 'Andorra', homeScore: 3, awayScore: 1 },
    ],
    away: [
      { date: '2024-11-19T19:45:00+00:00', home: 'Malta', away: 'Andorra', homeScore: 0, awayScore: 0 },
      { date: '2024-09-10T18:45:00+00:00', home: 'Andorra', away: 'Malta', homeScore: 0, awayScore: 1 },
    ],
  },
};

test('genera 10 guiones que pasan compliance con gate cerrado', () => {
  const out = buildYoutubeScripts(match);
  assert.equal(out.scripts.length, 10);
  assert.equal(out.matchId, match.webId);
  for (const script of out.scripts) {
    assert.deepEqual(checkScript(script, { published: false, matchId: out.matchId }), []);
    assert.ok(!/%/.test(`${script.hook} ${script.beats.join(' ')}`));
  }
  assert.deepEqual(checkDescription(out.description, { matchId: out.matchId }), []);
});

test('guiones bajo 50s y con CTA web', () => {
  const out = buildYoutubeScripts(match);
  for (const script of out.scripts) {
    const words = `${script.hook} ${script.beats.join(' ')}`.split(/\s+/).length;
    assert.ok(words <= 110, `${words} palabras`);
    assert.ok(script.beats.some(b => /goatlab\.win/.test(b)));
  }
});

test('sin datos igual entrega 10 guiones honestos', () => {
  const out = buildYoutubeScripts({ id: 'bz-x', home: 'A', away: 'B', competition: 'nations' });
  assert.equal(out.scripts.length, 10);
  for (const script of out.scripts) {
    assert.deepEqual(checkScript(script, { published: false }), []);
  }
});

test('selectMatches: todos los NS ordenados; --match y --limit recortan', () => {
  const rows = [
    { id: 'c', webId: 'c', status: 'NS', kickoff: '2026-09-26T00:00:00Z' },
    { id: 'a', webId: 'a', status: 'NS', kickoff: '2026-09-24T00:00:00Z' },
    { id: 'b', webId: 'b', status: 'FT', kickoff: '2026-09-23T00:00:00Z' },
  ];
  assert.deepEqual(selectMatches(rows).map(m => m.id), ['a', 'c']);
  assert.deepEqual(selectMatches(rows, { onlyMatch: 'c' }).map(m => m.id), ['c']);
  assert.deepEqual(selectMatches(rows, { limit: 1 }).map(m => m.id), ['a']);
});

test('staleScripts detecta rancios y sameCore ignora generatedAt', () => {
  assert.deepEqual(staleScripts(['a.json', 'b.json', 'x.txt'], ['a']), ['b.json']);
  assert.equal(sameCore({ a: 1, generatedAt: 'x' }, { a: 1, generatedAt: 'y' }), true);
  assert.equal(sameCore({ a: 1 }, { a: 2 }), false);
});
