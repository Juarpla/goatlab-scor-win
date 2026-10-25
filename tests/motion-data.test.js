import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMotion, MOTION_KINDS } from '../src/lib/motion-data.js';
const fact = { id: 'home.gf', label: 'España · goles', value: 3, unit: 'goles', source: 'fixtures:match', provider: 'Historial', sampleSize: 5 };
test('motion resolves original facts, common scale and honest missing data', () => {
  for (const kind of MOTION_KINDS) {
    const graphic={kind,factIds:[fact.id]};
    const data=resolveMotion(graphic,[fact]);
    assert.deepEqual(data.facts,[fact]); assert.equal(data.max,3); assert.match(data.notes[0],/5 partidos/);
    assert.deepEqual(resolveMotion({...graphic,factIds:[]},[]).facts,[]);
    assert.throws(()=>resolveMotion({...graphic,factIds:['invented']},[fact]),/inválido/);
  }
});
test('the director can choose comparisons and graphics without prescribed motion prompts', () => {
  const graphic={kind:'goals',factIds:[fact.id,'away.n']};
  const resolved=resolveMotion(graphic,[fact,{...fact,id:'away.n',unit:'partidos'}],[]);
  assert.equal(resolved.facts.length,2);
  assert.equal(resolveMotion({kind:'goals',presentation:'editorial',factIds:[]},[]).presentation,'editorial');
});

test('editorial presentations need no catalog and retain statistical legacy defaults', () => {
  const graphic={kind:'goals',presentation:'editorial',factIds:[]};
  assert.equal(resolveMotion(graphic,[]).presentation,'editorial');
  assert.equal(resolveMotion({...graphic,presentation:undefined},[]).presentation,'statistical');
  assert.throws(()=>resolveMotion({...graphic,presentation:'invented'},[]),/presentación/);
  assert.throws(()=>resolveMotion({...graphic,factIds:['home.gf']},[]),/editorial/);
});
