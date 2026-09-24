import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMediaManifest } from '../src/lib/compliance.js';
import {
  pickQueries,
  hashWebId,
  normalizePexelsPhoto,
  normalizePixabayHit,
  buildAttribution,
  buildManifest,
  QUERY_POOL,
  ALLOWED_SOURCES,
} from '../src/lib/media.js';

test('pickQueries es determinista, rota y respeta el count', () => {
  const a = pickQueries('andorra-vs-malta-2026-09-24');
  assert.equal(a.length, 3);
  assert.deepEqual(a, pickQueries('andorra-vs-malta-2026-09-24'));
  for (const q of a) assert.ok(QUERY_POOL.includes(q));
  assert.equal(new Set(a).size, 3);
  const other = pickQueries('serbia-vs-greece-2026-09-24', 2);
  assert.equal(other.length, 2);
});

test('hashWebId distribuye (no todo cae en el mismo offset)', () => {
  const offsets = new Set(
    ['a-x', 'b-y', 'c-z', 'd-w', 'e-v'].map(id => hashWebId(id) % QUERY_POOL.length),
  );
  assert.ok(offsets.size > 1);
});

test('normalizePexelsPhoto prefiere large2x y exige fotógrafo', () => {
  const out = normalizePexelsPhoto({
    id: 123,
    width: 2560,
    height: 1440,
    url: 'https://www.pexels.com/photo/123/',
    photographer: 'Ana',
    photographer_url: 'https://www.pexels.com/@ana/',
    src: { large2x: 'https://images.pexels.com/x?large2x', large: 'https://images.pexels.com/x?large' },
  }, 'q');
  assert.equal(out.url, 'https://images.pexels.com/x?large2x');
  assert.equal(out.source, 'pexels');
  assert.equal(normalizePexelsPhoto({ id: 1, src: { large: 'https://x' } }, 'q'), null);
  assert.equal(normalizePexelsPhoto(null, 'q'), null);
});

test('normalizePixabayHit prefiere fullHD y arma la página del autor', () => {
  const out = normalizePixabayHit({
    id: 456,
    pageURL: 'https://pixabay.com/photos/x-456/',
    user: 'Beto',
    user_id: 789,
    largeImageURL: 'https://cdn.pixabay.com/x_1280.jpg',
    fullHDURL: 'https://cdn.pixabay.com/x_1920.jpg',
  }, 'q');
  assert.equal(out.url, 'https://cdn.pixabay.com/x_1920.jpg');
  assert.equal(out.photographerUrl, 'https://pixabay.com/users/Beto-789/');
  assert.equal(normalizePixabayHit({ id: 1, largeImageURL: 'https://x' }, 'q'), null);
});

test('buildManifest + buildAttribution dedupican y arman queries', () => {
  const manifest = buildManifest({
    match: { webId: 'm-1', home: 'A', away: 'B', competition: 'nations', kickoff: '2026-09-24T00:00:00Z' },
    assets: [
      { source: 'pexels', id: '1', url: 'https://a', page: 'https://b', photographer: 'Ana', query: 'q1' },
      { source: 'pexels', id: '2', url: 'https://c', page: 'https://d', photographer: 'Ana', query: 'q2' },
      { source: 'pixabay', id: '3', url: 'https://e', page: 'https://f', photographer: 'Beto', query: 'q1' },
    ],
  });
  assert.equal(manifest.matchId, 'm-1');
  assert.deepEqual(manifest.queries, ['q1', 'q2']);
  assert.equal(manifest.attribution, 'Foto: Ana / Pexels · Foto: Beto / Pixabay');
  assert.deepEqual(checkMediaManifest(manifest, { matchId: 'm-1' }), []);
});

test('checkMediaManifest bloquea fuente mala, dominio prohibido y faltantes', () => {
  const base = {
    matchId: 'm-1',
    assets: [{ source: 'pexels', id: '1', url: 'https://images.pexels.com/x', page: 'https://www.pexels.com/photo/1/', photographer: 'Ana' }],
    attribution: 'Foto: Ana / Pexels',
  };
  assert.deepEqual(checkMediaManifest(base, { matchId: 'm-1' }), []);
  assert.ok(checkMediaManifest({ ...base, matchId: 'otro' }, { matchId: 'm-1' }).length > 0);
  assert.ok(checkMediaManifest({ ...base, assets: [] }).some(e => /sin assets/.test(e)));
  assert.ok(checkMediaManifest({ ...base, attribution: '' }).some(e => /atribución/.test(e)));
  const badSource = { ...base, assets: [{ ...base.assets[0], source: 'getty' }] };
  assert.ok(checkMediaManifest(badSource).some(e => /fuente no permitida/.test(e)));
  const badDomain = { ...base, assets: [{ ...base.assets[0], url: 'https://gettyimages.com/x.jpg' }] };
  assert.ok(checkMediaManifest(badDomain).some(e => /dominio prohibido/.test(e)));
  const noPhoto = { ...base, assets: [{ ...base.assets[0], photographer: '' }] };
  assert.ok(checkMediaManifest(noPhoto).some(e => /sin photographer/.test(e)));
  assert.ok(checkMediaManifest(null).length > 0);
  for (const s of ALLOWED_SOURCES) assert.ok(['pexels', 'pixabay'].includes(s));
});
