import test from 'node:test';
import assert from 'node:assert/strict';
import { checkText, checkScript, checkDescription, DISCLAIMER, isMediaManifestFile } from '../src/lib/compliance.js';

const good = {
  hook: 'Este cruce engaña: los números dicen otra cosa.',
  narration:
    'Este cruce engaña: los números dicen otra cosa. El local ganó tres de sus últimos cinco, con arco en cero dos veces. Mira este dato: el cara a cara suma cuatro duelos, dos empates y pocos goles. La forma actual contra el historial: ahí está la lectura. Todo el análisis, partido por partido, en goatlab.win.',
  description: 'x',
};

test('texto limpio pasa sin hallazgos', () => {
  assert.deepEqual(checkText('El local llega con tres victorias en cinco partidos.'), []);
});

test('detecta vocabulario de apuestas y claves crudas', () => {
  assert.ok(checkText('La cuota está buena para apostar').length > 0);
  assert.ok(checkText('El pick 1X2 y el BTTS pagan').length > 0);
  assert.ok(checkText('Gana seguro, 100% seguro garantizado').length > 0);
});

test('guion válido pasa con gate cerrado (sin %)', () => {
  assert.deepEqual(checkScript(good, { published: false }), []);
});

test('guion exige CTA a goatlab.win y techo de 50s', () => {
  const noCta = { ...good, narration: 'El local juega bien y defiende mejor. Cierre sin enlace.' };
  assert.ok(checkScript(noCta, { published: false }).some(e => /CTA/.test(e)));
  const long = { ...good, narration: `${good.narration} ${'relleno '.repeat(100)}` };
  assert.ok(checkScript(long, { published: false }).some(e => /50s/.test(e)));
});

test('gate cerrado bloquea porcentajes; abierto los permite', () => {
  const withPct = { ...good, hook: 'El local tiene 45% de algo.' };
  assert.ok(checkScript(withPct, { published: false }).some(e => /porcentajes/.test(e)));
  assert.deepEqual(checkScript(withPct, { published: true }), []);
});

test('descripción exige enlace, hashtag y disclaimer', () => {
  const desc = `Gran cruce.\n🔗 Más data: https://goatlab.win/partido/bz-1\n#goatlab #futbol\n${DISCLAIMER}`;
  assert.deepEqual(checkDescription(desc, { matchId: 'bz-1' }), []);
  assert.ok(checkDescription('sin nada', { matchId: 'bz-1' }).length >= 3);
});

test('solo <id>.json es manifiesto; notas de avance se ignoran', () => {
  assert.equal(isMediaManifestFile('malaga-vs-espanyol-2026-10-09.json'), true);
  assert.equal(isMediaManifestFile('malaga-vs-espanyol-2026-10-09.progress.json'), false);
  assert.equal(isMediaManifestFile('malaga-vs-espanyol-2026-10-09.ready'), false);
});

test('fraseo del pronóstico no dispara el vocabulario prohibido', () => {
  assert.deepEqual(checkText('La proyección se queda con la victoria de Arsenal en casa.'), []);
  assert.deepEqual(checkText('El diagnóstico final se queda con un partido corto y con Arsenal ganando por la mínima en casa.'), []);
  assert.deepEqual(checkText('Quédate con este dato. Este es el dato que manda. Acá está la clave. Guarda este número.'), []);
  assert.deepEqual(checkText('Dos caminos en uno: gana o empata, según el cálculo.'), []);
  assert.ok(checkText('La combinada de la jornada paga bien.').length > 0);
});

test('narración voz A con antecedente y pronóstico pasa con gate cerrado', () => {
  const narration = 'Arsenal y Leeds marcan lo mismo y ganan distinto, y eso no cierra por ningún lado. Quédate con este dato. En los últimos 5, Arsenal ganó 4 y Leeds empató 3 de sus partidos. Uno convierte la pegada en puntos y el otro la deja en empates. La proyección se queda con la victoria de Arsenal en casa. La lectura completa está en goatlab.win.';
  const words = narration.split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 55 && words <= 110, `${words} palabras`);
  assert.deepEqual(checkScript({ hook: narration.split('. ')[0] + '.', narration }, { published: false }), []);
});
