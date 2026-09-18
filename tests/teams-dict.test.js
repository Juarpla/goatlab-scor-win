import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  resolveCanonical, providerTeamId, webSlug, webMatchId, slugify,
} from '../src/lib/teams.js';

const catalog = JSON.parse(await readFile(new URL('../public/data/teams.json', import.meta.url), 'utf8')).teams;

test('el diccionario cubre las 5 ligas con triple id en los grandes', () => {
  for (const [slug, bz, af, fd] of [
    ['real-madrid', 57, 541, 86],
    ['barcelona', 44, 529, 81],
    ['arsenal', 18, 42, 57],
    ['manchester-city', 12, 50, 65],
    ['flamengo', 160, 127, 1783],
  ]) {
    const hit = resolveCanonical(catalog, slug.replace(/-/g, ' '));
    assert.equal(hit?.web, slug);
    assert.equal(providerTeamId(catalog, hit.display, 'bzzoiro'), bz);
    assert.equal(providerTeamId(catalog, hit.display, 'af'), af);
    assert.equal(providerTeamId(catalog, hit.display, 'fd'), fd);
  }
});

test('resolveCanonical tolera variantes de proveedor sin cruzar clubes', () => {
  assert.equal(resolveCanonical(catalog, 'Real Madrid CF')?.web, 'real-madrid');
  assert.equal(resolveCanonical(catalog, 'Paris Saint Germain')?.web, 'paris-saint-germain');
  assert.equal(resolveCanonical(catalog, 'Leeds United FC')?.web, 'leeds-united');
  assert.equal(resolveCanonical(catalog, 'Manchester United')?.web === resolveCanonical(catalog, 'Manchester City')?.web, false);
});

test('webSlug y webMatchId usan home-vs-away-fecha con fallback honesto', () => {
  assert.equal(webSlug(catalog, 'Sevilla'), 'sevilla');
  assert.equal(webSlug(catalog, 'Club Inexistente ZZ'), null);
  assert.equal(
    webMatchId(catalog, 'Real Madrid CF', 'Barcelona', '2026-10-26T20:00:00Z'),
    'real-madrid-vs-barcelona-2026-10-26');
  assert.equal(slugify('Real Betis Balompié'), 'real-betis-balompie');
});

test('ninguna entrada conserva fixture IDs contaminados', () => {
  for (const [slug, entry] of Object.entries(catalog)) {
    for (const provider of ['af', 'fd']) {
      const id = entry?.[provider]?.id;
      if (id != null) assert.ok(id < 30000, `${slug}.${provider}=${id} parece fixture ID`);
    }
  }
});
