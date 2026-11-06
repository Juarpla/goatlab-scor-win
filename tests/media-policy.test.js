import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaPolicy } from '../src/lib/media-policy.js';

test('editorial mode switches independently of the four-clip production target', () => {
  const config={mode:'clips-first',matches:['trial']};
  assert.deepEqual(mediaPolicy('trial',config),{mode:'clips-first',clips:4});
  assert.deepEqual(mediaPolicy('other',config),{mode:'freedom',clips:4});
  const prior={...config,mode:'freedom'};
  assert.deepEqual(mediaPolicy('trial',prior),{mode:'freedom',clips:4});
  assert.equal(mediaPolicy('any',{mode:'clips-first',matches:null}).clips,4);
  assert.throws(()=>mediaPolicy('any',{mode:'typo',matches:null}),/inválida/);
});

test('production defaults keep the freedom mode and four-clip generation target for every match',()=>{
  for(const match of ['levante-ud-vs-atletico-madrid-2026-10-31','any-other-match']) {
    assert.deepEqual(mediaPolicy(match),{mode:'freedom',clips:4});
  }
  for(const clips of [0,5,2.5,'4']) assert.throws(()=>mediaPolicy('x',{mode:'freedom',matches:null,clips}),/inválido/);
});
