import test from 'node:test';
import assert from 'node:assert/strict';
import { contentIdentityErrors, scriptStructureErrors, validateContent } from '../src/lib/match-content.js';
import { scriptBeats } from '../src/lib/script-beats.js';

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
  for (const category of ['scripts', 'image-prompts', 'video-prompts']) {
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

test('scripts without a pick remain valid; a present pick must have a shape', () => {
  const pick = { bridge: 'Quédate con este dato.', noun: 'La proyección', antecedent: 'Alpha ganó 2 de 3', verdict: 'la victoria de Alpha en casa', player: null, call: 'La lectura completa está en goatlab.win.' };
  const withPick = scriptData();
  withPick.scripts = withPick.scripts.map(script => ({ ...script, pick: { ...pick } }));
  assert.deepEqual(scriptStructureErrors(withPick, { matchId: match.webId, match }), []);
  for (const field of ['bridge', 'noun', 'antecedent', 'verdict', 'call']) {
    const broken = scriptData();
    broken.scripts[4] = { ...broken.scripts[4], pick: { ...pick, [field]: ' ' } };
    assert.ok(scriptStructureErrors(broken, { matchId: match.webId }).length, `pick.${field} vacío`);
    assert.equal(validateContent(broken, 'scripts', match.webId), false);
  }
});

function structuredScript(overrides = {}) {
  const projection = 'Mi lectura apunta a un empate.';
  return {
    n: 1,
    title: 'Título',
    hook: 'El partido se decide en el área.',
    narration: [
      { beat: 'gancho', text: 'El partido se decide en el área.' },
      { beat: 'fecha', text: 'Se juega el viernes 9 de octubre.' },
      { beat: 'dato', text: 'Alpha ganó 2 de sus últimos 5 y Beta llega con una sola derrota en la muestra.' },
      { beat: 'picante', text: 'Si Alpha adelanta líneas, Beta puede encontrar el espacio que necesita para lastimar de contra.' },
      { beat: 'proyeccion', text: projection },
      { beat: 'cierre', text: 'Todo el desglose, en goatlab.win.' },
    ],
    words: 60,
    projection,
    ...overrides,
  };
}

test('editorial v4 requires the ordered beats, one sentence per dato and matching hook and projection', () => {
  const data = { ...scriptData(), editorialVersion: 4, scripts: Array.from({ length: 10 }, (_, index) => ({ ...structuredScript(), n: index + 1, title: `Título ${index}` })) };
  assert.deepEqual(scriptStructureErrors(data), []);
  assert.equal(validateContent(data, 'scripts', match.webId), true);

  for (const mutate of [
    script => { script.narration[0].beat = 'dato'; },
    script => { script.narration[1].text = ''; },
    script => { script.narration[2].text = 'Corto.'; },
    script => { script.narration[4].text = 'Otra frase.'; },
    script => { script.hook = 'Otro gancho distinto.'; },
    script => { script.narration = 'Un párrafo viejo.'; },
  ]) {
    const broken = structuredClone(data);
    mutate(broken.scripts[0]);
    assert.ok(scriptStructureErrors(broken).length, mutate.toString());
  }
  const brokenBeat = structuredClone(data);
  brokenBeat.scripts[0].narration[2].text = 'Corto.';
  assert.ok(scriptStructureErrors(brokenBeat).some(error => /mínimo 6/.test(error)));

  const extraDato = structuredClone(data);
  extraDato.scripts[0].narration.splice(3, 0, { beat: 'dato', text: 'Beta llega con una sola derrota en la muestra.' });
  assert.deepEqual(scriptStructureErrors(extraDato), []);
  const labels = scriptBeats(extraDato.scripts[0].narration).map(beat => beat.label);
  assert.deepEqual(labels, ['Gancho', 'Fecha', 'Dato 1', 'Dato 2', 'Picante', 'Proyección', 'Cierre']);

  const extraPicante = structuredClone(extraDato);
  extraPicante.scripts[0].narration.splice(5, 0, { beat: 'picante', text: 'El espacio aparece cuando Alpha se estira.' });
  assert.deepEqual(scriptStructureErrors(extraPicante), []);
  assert.deepEqual(scriptBeats(extraPicante.scripts[0].narration).map(beat => beat.label), ['Gancho', 'Fecha', 'Dato 1', 'Dato 2', 'Picante 1', 'Picante 2', 'Proyección', 'Cierre']);

  const paragraphDato = structuredClone(data);
  paragraphDato.scripts[0].narration[2].text = 'Alpha ganó 2 de sus últimos 5. Beta llega con una sola derrota.';
  assert.ok(scriptStructureErrors(paragraphDato).some(error => /una sola frase/.test(error)));

  const noDate = structuredClone(data);
  noDate.scripts[0].narration.splice(1, 1);
  assert.ok(scriptStructureErrors(noDate).some(error => /fecha/.test(error)));
});

test('editorial files preserve their own projected sentence and legacy scripts stay reusable', () => {
  const data = { ...scriptData(), editorialVersion: 2 };
  assert.ok(scriptStructureErrors(data).some(error => /proyección editorial/.test(error)));
  for (const script of data.scripts) {
    script.projection = 'Mi lectura apunta a un empate.';
    script.narration += ' ' + script.projection;
  }
  assert.deepEqual(scriptStructureErrors(data), []);
  data.scripts[0].projection = 'Una frase ajena.';
  assert.ok(scriptStructureErrors(data).some(error => /proyección editorial/.test(error)));
  assert.deepEqual(scriptStructureErrors(scriptData()), []);
});
