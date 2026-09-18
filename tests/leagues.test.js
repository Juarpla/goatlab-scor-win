import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leagues, league, leagueName, providerLeagueId, leagueByProviderId,
  normalizeLeagueCatalog, findLeagueCollisions, mergeResolvedLeagues,
} from '../src/lib/leagues.js';
import { competitions } from '../src/lib/football.js';

test('el catálogo interno resuelve ids por proveedor y vuelta atrás', () => {
  assert.equal(league('laliga')?.name, 'LaLiga');
  assert.equal(providerLeagueId('laliga', 'api'), 140);
  assert.equal(providerLeagueId('laliga', 'fd'), 'PD');
  assert.equal(providerLeagueId('laliga', 'bzzoiro'), 3);
  assert.equal(leagueByProviderId('fd', 'PD')?.id, 'laliga');
  assert.equal(leagueByProviderId('api', 140)?.id, 'laliga');
  assert.equal(leagueByProviderId('bzzoiro', 3)?.id, 'laliga');
});

test('lo desconocido queda en null honesto, nunca inventado', () => {
  assert.equal(league('inexistente'), null);
  assert.equal(leagueName('inexistente'), null);
  assert.equal(providerLeagueId('laliga', 'otro'), null);
  assert.equal(leagueByProviderId('api', 999999), null);
  assert.equal(leagueByProviderId('api', null), null);
  assert.equal(leagueByProviderId('otro', 140), null);
});

test('competitions mantiene la vista histórica (id, name, api, fd) para páginas y script', () => {
  assert.equal(competitions.length, Object.keys(leagues).length);
  const laliga = competitions.find(c => c.id === 'laliga');
  assert.deepEqual(laliga, { id: 'laliga', name: 'LaLiga', api: 140, fd: 'PD' });
  assert.ok(competitions.every(c => c.name && c.id));
});

test('el catálogo real no tiene colisiones de códigos de proveedor', () => {
  const source = { leagues: Object.fromEntries(Object.entries(leagues).map(([id, e]) => [id, { name: e.name, providers: { api: e.providers.api, fd: e.providers.fd, bzzoiro: e.providers.bzzoiro } }])) };
  assert.deepEqual(findLeagueCollisions(source), []);
});

test('findLeagueCollisions detecta duplicados y normaliza entradas crudas', () => {
  const raw = {
    leagues: {
      a: { name: 'A', providers: { api: 1, fd: 'AA', bzzoiro: { id: 9 } } },
      b: { name: 'B', providers: { api: 1, fd: null, bzzoiro: 9 } },
    },
  };
  const collisions = findLeagueCollisions(raw);
  assert.equal(collisions.length, 2);
  assert.ok(collisions.every(c => c.leagues.length === 2));
  const normalized = normalizeLeagueCatalog(raw);
  assert.deepEqual(normalized.a.providers, { api: 1, fd: 'AA', bzzoiro: 9 });
  assert.equal(normalized.b.providers.fd, null);
});

test('mergeResolvedLeagues conserva api/fd y estampa el id Bzzoiro descubierto', () => {
  const base = { schemaVersion: 1, updatedAt: 'x', leagues: { laliga: { name: 'LaLiga', providers: { api: 140, fd: 'PD', bzzoiro: { id: null, name: null, resolvedAt: null } } } } };
  const merged = mergeResolvedLeagues(base, { laliga: { id: 3, name: 'La Liga', source: 'Bzzoiro' }, desconocida: { id: 99 } }, { at: '2026-09-18T00:00:00Z' });
  assert.equal(merged.leagues.laliga.providers.api, 140);
  assert.equal(merged.leagues.laliga.providers.fd, 'PD');
  assert.equal(merged.leagues.laliga.providers.bzzoiro.id, 3);
  assert.equal(merged.leagues.laliga.providers.bzzoiro.resolvedAt, '2026-09-18T00:00:00Z');
  assert.equal(merged.leagues.desconocida, undefined);
  assert.equal(merged.updatedAt, '2026-09-18T00:00:00Z');
});
