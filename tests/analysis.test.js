import test from 'node:test';
import assert from 'node:assert/strict';
import { matchIdentity, entryIdentity, sameFixture, findAnalysis, adoptAnalyses } from '../src/lib/analysis.js';

const v2Key = (id, home, away, kickoff) => `v2|M|${id}|${home}|${away}|laliga|${kickoff}|NS\nP|1.7|1.1|0.5|0.3|0.2|0.4|0.5`;
const entry = overrides => ({ summary: [{ title: 't', bullets: ['a', 'b'] }], limitations: [{ label: 'l', detail: 'd' }], ...overrides });

const osasuna = { id: 'af-1570399', home: 'Osasuna', away: 'Rayo Vallecano', kickoff: '2026-09-19T12:00:00+00:00' };
const legacy = entry({
  inputKey: v2Key('fd-564693', 'CA Osasuna', 'Rayo Vallecano de Madrid', '2026-09-19T12:00:00Z'),
});

test('entryIdentity lee campos estampados y los dos formatos de inputKey', () => {
  assert.deepEqual(entryIdentity(entry({ home: 'A', away: 'B', kickoff: '2026-09-19T12:00:00Z' })), { home: 'A', away: 'B', date: '2026-09-19' });
  assert.deepEqual(entryIdentity(legacy), { home: 'CA Osasuna', away: 'Rayo Vallecano de Madrid', date: '2026-09-19' });
  const old = entry({ inputKey: JSON.stringify({ id: 'fd-560589', home: 'Nottingham Forest FC', away: 'Coventry City FC', kickoff: '2026-09-19T16:30:00Z' }) });
  assert.deepEqual(entryIdentity(old), { home: 'Nottingham Forest FC', away: 'Coventry City FC', date: '2026-09-19' });
  assert.equal(entryIdentity(entry({ inputKey: 'v2|M|af-1' })), null);
  assert.equal(entryIdentity(null), null);
});

test('entryIdentity acepta el inputKey v3 de la pizarra', () => {
  const v3 = entry({ inputKey: 'v3|M|fd-564693|CA Osasuna|Rayo Vallecano de Madrid|laliga|2026-09-19T12:00:00Z|NS\nP|1.71|1.763' });
  assert.deepEqual(entryIdentity(v3), { home: 'CA Osasuna', away: 'Rayo Vallecano de Madrid', date: '2026-09-19' });
});

test('sameFixture tolera variantes de proveedor, exige mismo cruce y fecha cercana', () => {
  const a = matchIdentity(osasuna);
  assert.equal(sameFixture(entryIdentity(legacy), a), true);
  assert.equal(sameFixture({ home: 'Osasuna', away: 'Rayo Vallecano', date: '2026-09-20' }, a), true); // ±1 día
  assert.equal(sameFixture({ home: 'Osasuna', away: 'Rayo Vallecano', date: '2026-09-25' }, a), false);
  assert.equal(sameFixture({ home: 'Osasuna', away: 'Elche', date: '2026-09-19' }, a), false);
  assert.equal(sameFixture({ home: 'Rayo Vallecano', away: 'Osasuna', date: '2026-09-19' }, a), false); // localía no se invierte
});

test('findAnalysis prioriza el id directo y luego rescata el gemelo huérfano', () => {
  const analyses = { 'fd-564693': legacy, otro: entry({ home: 'A', away: 'B', kickoff: '2026-09-19T12:00:00Z' }) };
  const direct = findAnalysis(analyses, osasuna);
  assert.equal(direct.via, 'identity');
  assert.equal(direct.key, 'fd-564693');
  const withDirect = { ...analyses, 'af-1570399': entry({ inputKey: 'v2|x' }) };
  assert.equal(findAnalysis(withDirect, osasuna).via, 'id');
  assert.equal(findAnalysis({}, osasuna), null);
  assert.equal(findAnalysis(analyses, null), null);
});

test('adoptAnalyses re-clava, estampa identidad y sella el inputKey actual', () => {
  const analyses = { 'fd-564693': legacy, 'af-1557408': entry({ inputKey: 'v2|propia' }) };
  const brentford = { id: 'af-1557408', home: 'Brentford', away: 'Chelsea', kickoff: '2026-09-18T19:00:00+00:00', webId: 'brentford-vs-chelsea-2026-09-18' };
  const { analyses: next, adopted } = adoptAnalyses(analyses, [osasuna, brentford], { inputKeyFor: match => `v2|${match.id}` });
  assert.deepEqual(adopted, [{ from: 'fd-564693', to: 'af-1570399' }]);
  assert.equal(next['fd-564693'], undefined);
  assert.equal(next['af-1570399'].rekeyedFrom, 'fd-564693');
  assert.equal(next['af-1570399'].home, 'Osasuna');
  assert.equal(next['af-1570399'].kickoff, osasuna.kickoff);
  assert.equal(next['af-1570399'].inputKey, 'v2|af-1570399');
  assert.equal(next['af-1557408'].inputKey, 'v2|propia'); // la entrada directa no se toca
  assert.equal(analyses['fd-564693'], legacy); // puro: el mapa original queda intacto
});

test('adoptAnalyses no inventa gemelos entre cruces distintos ni duplica adopciones', () => {
  const analyses = { 'fd-564693': legacy };
  const { analyses: next, adopted } = adoptAnalyses(analyses, [
    { id: 'af-1', home: 'Sevilla', away: 'Barcelona', kickoff: '2026-09-19T19:00:00Z' },
    osasuna,
  ]);
  assert.equal(adopted.length, 1);
  assert.equal(Object.keys(next).length, 1);
  assert.ok(next['af-1570399']);
});
