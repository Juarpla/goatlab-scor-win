import test from 'node:test';
import assert from 'node:assert/strict';
import { computePlayerPulse, computePulse, computeCuriosities, buildMapData } from '../src/lib/journey.js';

test('computePlayerPulse nombra goleador, asistente y eficaz con club y competición', () => {
  const data = {
    premier: { scorers: [{ playerId: 1, player: 'Delantero A', team: 'Equipo A FC', value: 4, matches: 4 }], assists: [{ playerId: 2, player: 'Creador B', team: 'Equipo B', value: 3 }] },
    laliga: { scorers: [{ playerId: 3, player: 'Delantero C', team: 'Equipo C', value: 8, matches: 4 }], assists: [] },
  };
  const rows = computePlayerPulse(data);
  assert.equal(rows[0].label, 'El goleador');
  assert.equal(rows[0].fact, 'Delantero C');
  assert.match(rows[0].detail, /Equipo C · 8 goles en 4 partidos · LaLiga/);
  assert.equal(rows[1].fact, 'Creador B');
  // El goleador (4/4 = 1.0 por partido) no repite; gana el mejor ratio restante.
  assert.equal(rows[2].label, 'El más eficaz');
  assert.equal(rows[2].fact, 'Delantero A');
});

test('computePlayerPulse se omite sin datos y tolera tablas a medias', () => {
  assert.deepEqual(computePlayerPulse({}), []);
  assert.deepEqual(computePlayerPulse(null), []);
  const only = computePlayerPulse({ laliga: { scorers: [{ playerId: 1, player: 'X', team: 'T', value: 2, matches: 5 }], assists: [] } });
  assert.equal(only.length, 1); // goleador; el «más eficaz» no repite al mismo jugador ni hay asistencias
});
