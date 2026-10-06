import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMotion, MOTION_KINDS } from '../src/lib/motion-data.js';
const fact = { id: 'home.gf', label: 'España · goles', value: 3, unit: 'goles', source: 'fixtures:match', provider: 'Historial', sampleSize: 5 };
test('motion resolves original facts, common scale and honest missing data', () => {
  for (const [i,kind] of MOTION_KINDS.entries()) {
    const prompt={ n:i+1, kind, factIds:[fact.id] };
    const graphic={kind,motionPromptNumber:i+1,factIds:[fact.id]};
    const data=resolveMotion(graphic,[fact],[prompt]);
    assert.deepEqual(data.facts,[fact]); assert.equal(data.max,3); assert.match(data.notes[0],/5 partidos/);
    assert.deepEqual(resolveMotion({...graphic,factIds:[]},[],[{...prompt,factIds:[]}]).facts,[]);
    assert.throws(()=>resolveMotion({...graphic,factIds:['invented']},[fact],[prompt]),/ajeno/);
  }
});
test('motion refuses mismatched directions and incompatible comparison units', () => {
  const graphic={kind:'goals',motionPromptNumber:2,factIds:[fact.id,'away.n']};
  const prompts=[{n:2,kind:'goals',factIds:graphic.factIds}];
  assert.throws(()=>resolveMotion(graphic,[fact,{...fact,id:'away.n',unit:'partidos'}],prompts),/unidades/);
  assert.throws(()=>resolveMotion({...graphic,motionPromptNumber:3},[],prompts),/inexistente/);
});

test('editorial presentations need no catalog and retain statistical legacy defaults', () => {
  const prompts=[{n:2,kind:'goals',factIds:[]}];
  const graphic={kind:'goals',motionPromptNumber:2,presentation:'editorial',factIds:[]};
  assert.equal(resolveMotion(graphic,[],prompts).presentation,'editorial');
  assert.equal(resolveMotion({...graphic,presentation:undefined},[],prompts).presentation,'statistical');
  assert.throws(()=>resolveMotion({...graphic,presentation:'invented'},[],prompts),/presentación/);
  assert.throws(()=>resolveMotion({...graphic,factIds:['home.gf']},[],prompts),/editorial/);
});
