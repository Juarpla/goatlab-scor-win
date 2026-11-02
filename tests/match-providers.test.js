import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOneX2, deriveDoubleChance, deriveDnb, decisiveness, pickDecisive } from '../src/lib/provider-markets.js';

const close = (a, b, epsilon = 0.002) => Math.abs(a - b) <= epsilon;

// Sevilla vs Barcelona 2026-09-19: Bzzoiro oneX2 + API-Football percent reales.
const BZ = { home: 0.083, draw: 0.13, away: 0.7859999999999999, predicted: 'A' };
const AF = { home: 0.1, draw: 0.45, away: 0.45 };

test('normaliza el 1X2 de Bzzoiro a suma 1 e ignora `predicted`', () => {
  const oneX2 = normalizeOneX2(BZ);
  assert.equal(Math.round((oneX2.home + oneX2.draw + oneX2.away) * 1000), 1000);
  assert.ok(close(oneX2.home, 0.083));
  assert.ok(close(oneX2.away, 0.786));
});

test('normaliza el percent de API-Football', () => {
  const oneX2 = normalizeOneX2(AF);
  assert.ok(close(oneX2.home, 0.1));
  assert.ok(close(oneX2.draw, 0.45));
  assert.ok(close(oneX2.away, 0.45));
});

test('null-honesto ante 1X2 irreconocible', () => {
  assert.equal(normalizeOneX2(null), null);
  assert.equal(normalizeOneX2({ home: 0.5, draw: null, away: 0.5 }), null);
  assert.equal(normalizeOneX2({ home: 0, draw: 0, away: 0 }), null);
});

test('doble oportunidad del Sevilla–Barça (Bzzoiro): 1X 0.213 / X2 0.916', () => {
  const dc = deriveDoubleChance(normalizeOneX2(BZ));
  assert.ok(close(dc['1X'], 0.213));
  assert.ok(close(dc.X2, 0.916));
  assert.ok(close(dc['12'] + normalizeOneX2(BZ).draw, 1));
});

test('DNB del Sevilla–Barça (Bzzoiro): ~10/90 y suma 1', () => {
  const dnb = deriveDnb(normalizeOneX2(BZ));
  assert.ok(close(dnb.home, 0.096));
  assert.ok(close(dnb.away, 0.904));
  assert.equal(Math.round((dnb.home + dnb.away) * 100), 100);
});

test('la menos conservadora del Sevilla–Barça es Bzzoiro (gap 0.70 vs 0.35)', () => {
  assert.ok(decisiveness(normalizeOneX2(BZ)) > decisiveness(normalizeOneX2(AF)));
  assert.equal(pickDecisive(normalizeOneX2(BZ), normalizeOneX2(AF)), 'bz');
});

test('pickDecisive: gana la más decisiva, empate va a Bzzoiro, nulls honestos', () => {
  const flat = { home: 0.4, draw: 0.2, away: 0.4 };
  const sharp = { home: 0.1, draw: 0.1, away: 0.8 };
  assert.equal(pickDecisive(sharp, flat), 'bz');
  assert.equal(pickDecisive(flat, sharp), 'af');
  assert.equal(pickDecisive(sharp, { ...sharp }), 'bz');
  assert.equal(pickDecisive(sharp, null), 'bz');
  assert.equal(pickDecisive(null, sharp), 'af');
  assert.equal(pickDecisive(null, null), null);
});
