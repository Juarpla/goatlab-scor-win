import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReading, matchFigures, formatFigure, inferKind, READING_KINDS } from '../src/lib/reading.js';

test('normalizeReading acepta el párrafo legacy como una sección de panorama', () => {
  const reading = normalizeReading({
    summary: 'Tottenham y Aston Villa se enfrentan en Premier; solo hay datos de calendario.',
    limitations: 'Sin estadísticas suficientes para analizar.',
  });
  assert.equal(reading.sections.length, 1);
  assert.equal(reading.sections[0].kind, 'panorama');
  assert.deepEqual(reading.sections[0].stats, []);
  assert.deepEqual(reading.sections[0].bullets, ['Tottenham y Aston Villa se enfrentan en Premier; solo hay datos de calendario.']);
});

test('la auditoría del LLM nunca llega a la vista', () => {
  const reading = normalizeReading({
    summary: [{ title: 'Contexto', bullets: ['Dos líneas de contexto.', 'Otra línea.'] }],
    limitations: [{ label: 'Muestra corta', detail: 'La tabla cubre 4 jornadas.' }],
  });
  assert.equal(reading.sections.length, 1);
  assert.equal('limits' in reading, false);
  assert.equal(JSON.stringify(reading).includes('Muestra corta'), false);
});

test('normalizeReading conserva kind y stats v3 y descarta cifras que el texto no dice', () => {
  const reading = normalizeReading({
    summary: [{
      kind: 'modelos',
      title: 'Los modelos no se ponen de acuerdo',
      bullets: ['Poisson da 36.8% al local y 39% al visitante.', 'CatBoost se queda en 29.4%.'],
      stats: [{ value: '36.8%', label: 'Osasuna' }, { value: '39%', label: 'Rayo' }, { value: '99%', label: 'Inventada' }],
    }],
  });
  assert.equal(reading.sections[0].kind, 'modelos');
  assert.deepEqual(reading.sections[0].stats, [{ value: '36.8%', label: 'Osasuna' }, { value: '39%', label: 'Rayo' }]);
});

test('normalizeReading infiere el kind de secciones v2 y acota stats a tres', () => {
  const reading = normalizeReading({
    summary: [{
      title: 'Forma reciente: ambos tambaleantes',
      bullets: ['Osasuna encadena 2-5, 0-2, 0-4 y 3 empates.'],
      stats: [{ value: '2-5', label: 'a' }, { value: '0-2', label: 'b' }, { value: '0-4', label: 'c' }, { value: '3', label: 'd' }],
    }],
  });
  assert.equal(reading.sections[0].kind, 'forma');
  assert.equal(reading.sections[0].stats.length, 3);
});

test('inferKind reconoce las familias del relato', () => {
  assert.equal(inferKind('Los modelos no se ponen de acuerdo'), 'modelos');
  assert.equal(inferKind('Historial con guiño rojillo'), 'historial');
  assert.equal(inferKind('Tabla y forma reciente'), 'tabla');
  assert.equal(inferKind('Goleadores'), 'goleadores');
  assert.equal(inferKind('Haaland enciende la tabla de goleadores'), 'goleadores');
  assert.equal(inferKind('Forma reciente: ambos tambaleantes'), 'forma');
  assert.equal(inferKind('Osasuna recibe al Rayo en LaLiga'), 'panorama');
  for (const kind of READING_KINDS) assert.equal(typeof kind, 'string');
});

test('inferKind decide por título y no se deja arrastrar por los bullets', () => {
  assert.equal(inferKind('Osasuna recibe al Rayo en LaLiga', ['El Rayo visita Pamplona con Sergio Camello como su referencia goleadora del curso.']), 'panorama');
  assert.equal(inferKind('City recibe al Sunderland en el Etihad', ['El City llega segundo con 12 puntos en 4 jornadas y saldo de 8 goles.']), 'panorama');
  assert.equal(inferKind('Brentford vs Chelsea: cita del viernes en Premier', ['El historial reciente suma 14 enfrentamientos y tres empates en los últimos cruces.']), 'panorama');
  assert.equal(inferKind('El cruce'), 'historial');
});

test('normalizeReading devuelve null sin contenido y capa las secciones a cinco', () => {
  assert.equal(normalizeReading(null), null);
  assert.equal(normalizeReading({ summary: [], limitations: [] }), null);
  const many = Array.from({ length: 8 }, (_, index) => ({ title: `Sección ${index}`, bullets: ['Uno.', 'Dos.'] }));
  assert.equal(normalizeReading({ summary: many }).sections.length, 5);
});

test('matchFigures marca las cifras declaradas sin tocar el resto del texto', () => {
  const parts = matchFigures('Poisson da 36.8% al local y 1.71 goles esperados; CatBoost ve 29.4%.', [
    { value: '36.8%', label: 'local' },
    { value: '1.71', label: 'xG' },
  ]);
  assert.deepEqual(parts, [
    { text: 'Poisson da ' },
    { text: '36,8%', figure: true },
    { text: ' al local y ' },
    { text: '1,71', figure: true },
    { text: ' goles esperados; CatBoost ve 29.4%.' },
  ]);
});

test('matchFigures tolera coma o punto en la cifra y no solapa coincidencias', () => {
  const parts = matchFigures('El reparto es 36,8% local y 39% visitante.', [{ value: '36.8%', label: 'local' }, { value: '39%', label: 'visita' }]);
  assert.deepEqual(parts, [
    { text: 'El reparto es ' },
    { text: '36,8%', figure: true },
    { text: ' local y ' },
    { text: '39%', figure: true },
    { text: ' visitante.' },
  ]);
  const repeated = matchFigures('1.71 local y 1.71 visitante', [{ value: '1.71', label: 'xG' }]);
  assert.equal(repeated.filter(part => part.figure).length, 2);
});

test('matchFigures sin stats devuelve el texto íntegro', () => {
  assert.deepEqual(matchFigures('Texto sin cifras.', []), [{ text: 'Texto sin cifras.' }]);
  assert.deepEqual(matchFigures('', [{ value: '1', label: 'x' }]), [{ text: '' }]);
});

test('formatFigure convierte decimales a coma latina y respeta enteros', () => {
  assert.equal(formatFigure('36.8%'), '36,8%');
  assert.equal(formatFigure('1.763'), '1,763');
  assert.equal(formatFigure('2-5'), '2-5');
  assert.equal(formatFigure('13'), '13');
});
