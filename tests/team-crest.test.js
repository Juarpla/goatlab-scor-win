import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { teamCrestId } from '../src/lib/team-crest.js';
const catalog = JSON.parse(readFileSync(new URL('../public/data/teams.json', import.meta.url)));
test('FD-only fixtures recover crests from canonical team identity', () => {
  assert.equal(teamCrestId(catalog, 'Arsenal', null), 18);
  assert.equal(teamCrestId(catalog, 'Borussia Dortmund'), 92);
  assert.equal(teamCrestId(catalog, 'Como 1907'), 69);
});
test('exact club identity avoids Barcelona SC ambiguity and missing Lille crest', () => {
  assert.equal(teamCrestId(catalog, 'FC Barcelona'), 44);
  assert.equal(teamCrestId(catalog, 'Lille OSC'), 106);
  assert.equal(teamCrestId(catalog, 'Unknown team'), null);
  assert.equal(teamCrestId(catalog, 'Arsenal', 123), 123);
});
