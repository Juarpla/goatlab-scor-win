import test from 'node:test';
import assert from 'node:assert/strict';
import { contentIdentityErrors, scriptStructureErrors, validateContent } from '../src/lib/match-content.js';

const match = { id: 'af-1', webId: 'spain-vs-netherlands-date', home: 'Spain', away: 'Netherlands', competition: 'nations', kickoff: '2026-10-09T18:00:00Z' };
function scriptData() {
  return { matchId: match.webId, home: 'España', away: 'Países Bajos', competition: match.competition, kickoff: match.kickoff, description: 'Una descripción guardada.', scripts: Array.from({ length: 10 }, (_, index) => ({ n: index + 1, title: `Título ${index}`, hook: `Gancho ${index}`, narration: `Narración guardada ${index}`, words: 3 })) };
}

test('saved-script structure validates complete identity and ten ordered narrations', () => {
  const data = scriptData();
  assert.deepEqual(scriptStructureErrors(data, { matchId: match.webId, match }), []);
  assert.equal(validateContent(data, 'scripts', match.webId, { match }), true);
  assert.equal(validateContent({ ...data, kickoff: '2026-10-09T18:00:00+00:00' }, 'scripts', match.webId, { match }), true);
});

test('empty or malformed required fields are corrupt rather than reusable scripts', () => {
  for (const value of [null, [], 'broken']) assert.ok(scriptStructureErrors(value, { matchId: match.webId }).length);
  for (const field of ['matchId', 'home', 'away', 'competition', 'kickoff', 'description']) {
    const data = scriptData(); delete data[field];
    assert.ok(scriptStructureErrors(data, { matchId: match.webId }).length, field);
    assert.equal(validateContent(data, 'scripts', match.webId), false, field);
  }
  for (const count of [0, 9, 11]) {
    const data = scriptData(); data.scripts = Array.from({ length: count }, (_, index) => data.scripts[index % 10]);
    assert.ok(scriptStructureErrors(data).length);
  }
});

test('each saved narration needs numbering, title, hook, text and positive integer words', () => {
  for (const [field, value] of [['n', 2], ['title', ' '], ['hook', null], ['narration', 5], ['words', 0], ['words', -1], ['words', 1.5], ['words', '3']]) {
    const data = scriptData(); data.scripts[0][field] = value;
    assert.ok(scriptStructureErrors(data).length, `${field}=${value}`);
    assert.equal(validateContent(data, 'scripts', match.webId), false);
  }
});

test('translated fixture identity is reusable by scripts and every prompt category', () => {
  const data = scriptData();
  for (const category of ['scripts', 'image-prompts', 'video-prompts', 'motion-prompts']) {
    assert.deepEqual(contentIdentityErrors({ ...data, category }, match), []);
  }
  for (const override of [{ matchId: 'af-1' }, { home: 'Spain' }, { away: 'Netherlands' }, { competition: 'other' }, { kickoff: '2026-10-09T19:00:00Z' }]) {
    assert.ok(contentIdentityErrors({ ...data, ...override }, match).length);
    assert.ok(scriptStructureErrors({ ...data, ...override }, { match }).length);
  }
  assert.ok(scriptStructureErrors(data, { matchId: 'different-file' }).length);
});

test('preserved narratives are not checked against newly available statistics', () => {
  const data = scriptData();
  data.scripts[0].narration = 'La lectura preservada mencionaba 99 goles y una figura histórica.';
  data.scripts[0].words = 1;
  data.facts = [{ badHistoricalFact: true }];
  assert.deepEqual(scriptStructureErrors(data, { match: { ...match, homeScore: 0, lastMatches: { home: [] } } }), []);
  assert.equal(validateContent(data, 'scripts', match.webId), true);
});
