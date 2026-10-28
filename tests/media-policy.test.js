import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaPolicy, montageDirection } from '../src/lib/media-policy.js';

test('editorial mode switches independently of the four-clip production target', () => {
  const config={mode:'clips-first',matches:['trial']};
  assert.deepEqual(mediaPolicy('trial',config),{mode:'clips-first',clips:4});
  assert.deepEqual(mediaPolicy('other',config),{mode:'freedom',clips:4});
  const prior={...config,mode:'freedom'};
  assert.deepEqual(mediaPolicy('trial',prior),{mode:'freedom',clips:4});
  assert.match(montageDirection('trial',config),/prioriza los clips/);
  assert.doesNotMatch(montageDirection('trial',config),/trabaja solo con gráficos/);
  assert.match(montageDirection('trial',prior),/libertad creativa/);
  assert.doesNotMatch(montageDirection('trial',prior),/trabaja solo con gráficos/);
  assert.equal(mediaPolicy('any',{mode:'clips-first',matches:null}).clips,4);
  assert.throws(()=>mediaPolicy('any',{mode:'typo',matches:null}),/inválida/);
});

test('production defaults keep creative editing with media protagonists and four clips for every match',()=>{
  for(const match of ['levante-ud-vs-atletico-madrid-2026-10-31','any-other-match']) {
    assert.deepEqual(mediaPolicy(match),{mode:'freedom',clips:4});
    assert.doesNotMatch(montageDirection(match),/prioriza los clips/);
  }
  for(const clips of [0,5,2.5,'4']) assert.throws(()=>mediaPolicy('x',{mode:'freedom',matches:null,clips}),/inválido/);
});

// The direction is the actual instruction sent to OpenClaw, including retries.
test('both modes keep media central, free editing and a graphics fallback only for unusable banks', () => {
  for (const mode of ['freedom', 'clips-first']) {
    const direction = montageDirection('any', { mode, matches: null, clips: 4 });
    assert.match(direction, /clips y las imágenes disponibles como base visual protagonista/);
    assert.match(direction, /gráficos, títulos y datos son apoyo/);
    assert.match(direction, /transiciones, efectos, composición y edición/);
    assert.match(direction, /sin porcentajes ni obligación de utilizar todos/);
    assert.match(direction, /banco parcial, aprovecha los recursos utilizables/);
    assert.match(direction, /si solo hay fotos o solo clips/);
    assert.match(direction, /Solo si no hay imágenes ni clips utilizables, compón con gráficos/);
    assert.match(direction, /índice.*limitación técnica/);
  }
});
