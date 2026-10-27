import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaPolicy, montageDirection } from '../src/lib/media-policy.js';

test('one switch restores freedom and two new clips while keeping the scoped trial reversible', () => {
  const config={mode:'clips-first',matches:['trial']};
  assert.deepEqual(mediaPolicy('trial',config),{mode:'clips-first',clips:3});
  assert.deepEqual(mediaPolicy('other',config),{mode:'freedom',clips:2});
  const prior={...config,mode:'freedom'};
  assert.deepEqual(mediaPolicy('trial',prior),{mode:'freedom',clips:2});
  assert.match(montageDirection('trial',config),/prioriza los clips/);
  assert.doesNotMatch(montageDirection('trial',config),/trabaja solo con gráficos/);
  assert.match(montageDirection('trial',prior),/libertad completa/);
  assert.match(montageDirection('trial',prior),/trabaja solo con gráficos/);
  assert.equal(mediaPolicy('any',{mode:'clips-first',matches:null}).clips,3);
  assert.throws(()=>mediaPolicy('any',{mode:'typo',matches:null}),/inválida/);
});
