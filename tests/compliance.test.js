import test from 'node:test';
import assert from 'node:assert/strict';
import { checkText, checkScript, checkDescription, DISCLAIMER } from '../src/lib/compliance.js';

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
