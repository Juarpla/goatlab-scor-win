import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMediaManifest } from '../src/lib/compliance.js';
import {
  sceneQueries,
  selectAssets,
  orderPool,
  AI_CREDIT,
  hashWebId,
  classifyLicense,
  acceptAssetLicense,
  acceptVisionVerdict,
  normalizeCommonsPage,
  normalizePexelsPhoto,
  normalizePixabayHit,
  buildAttribution,
  buildManifest,
  isUsableStill,
  subjectFor,
  ASSETS_MIN,
  ASSETS_PER_MATCH,
  ALLOWED_SOURCES,
} from '../src/lib/media.js';

function asset(i, motive = 'player') {
  return {
    source: 'commons',
    id: String(i),
    url: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/${i}.jpg`,
    page: `https://commons.wikimedia.org/wiki/File:${i}.jpg`,
    photographer: `Author ${i % 5}`,
    photographerUrl: `https://commons.wikimedia.org/wiki/File:${i}.jpg`,
    license: 'CC BY 4.0',
    query: 'Kenan Yıldız footballer',
    motive,
    seen: { model: 'mimo-v2.6-flash', at: '2026-09-30T12:00:00.000Z' },
  };
}

test('classifyLicense acepta uso comercial y rechaza NC y ND', () => {
  assert.equal(classifyLicense('CC BY 4.0'), 'CC BY 4.0');
  assert.equal(classifyLicense('CC BY-SA 3.0'), 'CC BY-SA 3.0');
  assert.equal(classifyLicense('CC0'), 'CC0');
  assert.equal(classifyLicense('Public domain'), 'Public domain');
  assert.equal(classifyLicense('CC BY-NC 4.0'), null);
  assert.equal(classifyLicense('CC BY-ND 2.0'), null);
  assert.equal(classifyLicense('CC BY-NC-SA 4.0'), null);
  assert.equal(classifyLicense(''), null);
  assert.equal(acceptAssetLicense('commons', 'CC BY 4.0'), 'CC BY 4.0');
  assert.equal(acceptAssetLicense('commons', 'CC BY-NC 4.0'), null);
  assert.equal(acceptAssetLicense('pexels', 'Pexels License'), 'Pexels License');
  assert.equal(acceptAssetLicense('pixabay', 'Pixabay Content License'), 'Pixabay Content License');
  assert.equal(acceptAssetLicense('pexels', 'CC BY 4.0'), null);
  assert.equal(acceptAssetLicense('getty', 'Pexels License'), null);
});

test('sceneQueries busca hombres en entrenamiento, entrevista, llegada, hinchada y prensa', () => {
  const queries = sceneQueries({ home: 'France', away: 'Italy' });
  assert.ok(queries.some(q => q.query === "France men's national team training" && q.scene === 'training'));
  assert.ok(queries.some(q => q.query === "Italy men's national team interview" && q.scene === 'interview'));
  assert.ok(queries.some(q => q.query === "France men's team bus" && q.scene === 'arrival'));
  assert.ok(queries.some(q => q.query === "Italy men's football fans" && q.scene === 'fans'));
  assert.ok(queries.some(q => q.query === "France men's press conference" && q.scene === 'press'));
  assert.ok(queries.every(q => /men's/.test(q.query)));
  assert.ok(!queries.some(q => /line up|footballer|soccer player/.test(q.query)));
});

test('normalizeCommonsPage exige licencia libre, autor y foto', () => {
  const page = {
    pageid: 99,
    title: 'File:Kenan training.jpg',
    imageinfo: [{
      mime: 'image/jpeg',
      thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a.jpg',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Kenan_training.jpg',
      thumbwidth: 1080,
      thumbheight: 720,
      extmetadata: {
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        Artist: { value: '<a href="https://commons.wikimedia.org/wiki/User:Ana">Ana</a>' },
        ImageDescription: { value: 'Kenan at training' },
      },
    }],
  };
  const out = normalizeCommonsPage(page, 'Kenan footballer');
  assert.equal(out.source, 'commons');
  assert.equal(out.photographer, 'Ana');
  assert.equal(out.motive, 'training');
  assert.equal(out.license, 'CC BY-SA 4.0');
  const nc = structuredClone(page);
  nc.imageinfo[0].extmetadata.LicenseShortName.value = 'CC BY-NC 4.0';
  assert.equal(normalizeCommonsPage(nc, 'q'), null);
  const flag = structuredClone(page);
  flag.title = 'File:Flag of Italy.jpg';
  assert.equal(normalizeCommonsPage(flag, 'q'), null);
  const kit = structuredClone(page);
  kit.title = 'File:Kit_body_slovenia01a.png';
  assert.equal(normalizeCommonsPage(kit, 'q'), null);
  const women = structuredClone(page);
  women.title = "File:France women's national team training.jpg";
  assert.equal(normalizeCommonsPage(women, 'q'), null);
  assert.equal(isUsableStill({ url: 'https://upload.wikimedia.org/wikipedia/commons/France_women_training.jpg', page: 'https://commons.wikimedia.org/wiki/File:France_women.jpg' }), false);
  assert.equal(normalizeCommonsPage(null, 'q'), null);
});

test('buildManifest arma hasta 15 fotos y publica desde 8', () => {
  const assets = Array.from({ length: 24 }, (_, i) => asset(i, i < 3 ? 'training' : 'portrait'));
  const manifest = buildManifest({
    match: { webId: 'm-1', home: 'Türkiye', away: 'Italy', competition: 'nations', kickoff: '2026-09-28T18:45:00Z' },
    assets,
  });
  assert.equal(manifest.assets.length, ASSETS_PER_MATCH);
  assert.equal(manifest.assets[0].motive, 'training');
  assert.equal(manifest.sequences, undefined);
  assert.match(manifest.attribution, /Wikimedia Commons \(CC BY 4.0\)/);
  assert.deepEqual(checkMediaManifest(manifest, { matchId: 'm-1' }), []);
  const floor = buildManifest({
    match: { webId: 'm-1', home: 'A', away: 'B' },
    assets: Array.from({ length: ASSETS_MIN }, (_, i) => asset(i, 'portrait')),
  });
  assert.equal(floor.assets.length, ASSETS_MIN);
  assert.deepEqual(checkMediaManifest(floor, { matchId: 'm-1' }), []);
  assert.equal(new Set([hashWebId('a'), hashWebId('b')]).size, 2);
});

test('checkMediaManifest bloquea pool corto, licencia y dominio', () => {
  const manifest = buildManifest({
    match: { webId: 'm-1', home: 'A', away: 'B' },
    assets: Array.from({ length: 20 }, (_, i) => asset(i)),
  });
  assert.ok(checkMediaManifest({ ...manifest, assets: manifest.assets.slice(0, 3) }).some(e => /faltan fotos/.test(e)));
  const bad = structuredClone(manifest);
  bad.assets[0].license = 'CC BY-NC 4.0';
  assert.ok(checkMediaManifest(bad).some(e => /licencia no libre/.test(e)));
  const unseen = structuredClone(manifest);
  delete unseen.assets[0].seen;
  assert.ok(checkMediaManifest(unseen).some(e => /no vio la foto/.test(e)));
  const banned = structuredClone(manifest);
  banned.assets[0].url = 'https://media.gettyimages.com/x.jpg';
  assert.ok(checkMediaManifest(banned).some(e => /dominio prohibido/.test(e)));
  const stockAssets = Array.from({ length: ASSETS_PER_MATCH }, (_, i) => asset(i, 'portrait'));
  stockAssets[0] = {
    ...stockAssets[0],
    source: 'pexels',
    url: 'https://images.pexels.com/photos/1/x.jpeg',
    page: 'https://www.pexels.com/photo/1/',
    photographerUrl: 'https://www.pexels.com/@ana',
    license: 'Pexels License',
  };
  const stock = buildManifest({ match: { webId: 'm-1', home: 'A', away: 'B' }, assets: stockAssets });
  assert.deepEqual(checkMediaManifest(stock, { matchId: 'm-1' }), []);
  assert.ok(checkMediaManifest(null).length > 0);
  assert.deepEqual(ALLOWED_SOURCES, ['commons', 'pexels', 'pixabay', 'agnes']);
  assert.equal(subjectFor('Álvaro Morata', 'File:Alvaro_Morata_training.jpg'), 'Álvaro Morata');
  assert.equal(subjectFor('San', 'File:San_Siro.jpg'), null);
  assert.equal(subjectFor('Dennis Man', 'File:Flag_of_Romania.jpg'), null);
  assert.equal(orderPool([]), null);
  assert.equal(orderPool([{ url: 'https://a.example/one.jpg' }]), null);
  assert.match(buildAttribution([{ source: 'commons', photographer: 'Ana', license: 'CC0' }]), /Ana/);
  assert.match(buildAttribution([{ source: 'pixabay', photographer: 'Luis', license: 'Pixabay Content License' }]), /Pixabay \(Pixabay Content License\)/);
  const pexels = normalizePexelsPhoto({
    id: 7,
    photographer: 'Ana',
    photographer_url: 'https://www.pexels.com/@ana',
    url: 'https://www.pexels.com/photo/7/',
    alt: 'Kenan Yıldız training',
    src: { large: 'https://images.pexels.com/photos/7/large.jpeg', medium: 'https://images.pexels.com/photos/7/medium.jpeg' },
  }, 'Kenan Yıldız footballer', { player: 'Kenan Yıldız' });
  assert.equal(pexels.source, 'pexels');
  assert.equal(pexels.license, 'Pexels License');
  assert.equal(pexels.motive, 'training');
  assert.equal(pexels.subject, 'Kenan Yıldız');
  assert.equal(normalizePexelsPhoto({ id: 1 }, 'q'), null);
  const pixabay = normalizePixabayHit({
    id: 8,
    user: 'Luis',
    pageURL: 'https://pixabay.com/photos/8/',
    largeImageURL: 'https://cdn.pixabay.com/photo/8.jpg',
    webformatURL: 'https://cdn.pixabay.com/photo/8_640.jpg',
    tags: 'portrait football',
  }, 'Kenan Yıldız', { player: 'Kenan Yıldız' });
  assert.equal(pixabay.source, 'pixabay');
  assert.equal(pixabay.motive, 'portrait');
  assert.equal(normalizePixabayHit({ id: 1, largeImageURL: 'http://insecure.example/a.jpg' }, 'q'), null);
  assert.deepEqual(
    acceptVisionVerdict({ ok: true, motive: 'portrait', men: true, current: true }),
    { subject: null, motive: 'portrait' },
  );
  assert.equal(acceptVisionVerdict({ ok: false, motive: 'portrait', men: true, current: true }), null);
  assert.equal(acceptVisionVerdict({ ok: true, motive: 'portrait', men: false, current: true }), null);
  assert.equal(acceptVisionVerdict({ ok: true, motive: 'portrait', men: true, current: false }), null);
  assert.equal(acceptVisionVerdict({ ok: true, motive: 'after', men: true, current: true }), null);
  assert.deepEqual(acceptVisionVerdict({ ok: true, motive: 'fans', men: true, current: true }), { subject: null, motive: 'fans' });
  assert.equal(acceptVisionVerdict({ ok: true, motive: 'logo', men: true, current: true }), null);
  assert.deepEqual(
    acceptVisionVerdict({ ok: true, motive: 'training', men: true, current: true }),
    { subject: null, motive: 'training' },
  );
});

test('orderPool pone primero lo que nombra la voz y cambia el corte por audio', () => {
  const pool = [
    { url: 'https://a.example/train.jpg', motive: 'training', query: "France men's training", id: '1' },
    { url: 'https://a.example/fans.jpg', motive: 'fans', query: "Italy men's fans", id: '2' },
    { url: 'https://a.example/press.jpg', motive: 'press', query: "France men's press", id: '3' },
    { url: 'https://a.example/bus.jpg', motive: 'arrival', query: "Italy men's bus", id: '4' },
  ];
  const first = orderPool(pool, { variant: 0, words: [{ word: 'hinchada' }], home: 'France', away: 'Italy' });
  const second = orderPool(pool, { variant: 1, words: [{ word: 'hinchada' }], home: 'France', away: 'Italy' });
  assert.equal(first.photos[0], 'https://a.example/fans.jpg');
  assert.equal(second.photos[0], 'https://a.example/fans.jpg');
  assert.notEqual(first.photos.join('|'), second.photos.join('|'));
  assert.notEqual(first.camera, second.camera);
  const quiet = orderPool(pool, { variant: 0, words: [], home: 'France', away: 'Italy' });
  const next = orderPool(pool, { variant: 3, words: [], home: 'France', away: 'Italy' });
  assert.notEqual(quiet.photos.join('|'), next.photos.join('|'));
});

test('selectAssets reserva plazas de escena y buildManifest avisa de IA', () => {
  const players = Array.from({ length: 20 }, (_, i) => asset(i, 'portrait'));
  const scenes = Array.from({ length: 8 }, (_, i) => ({
    ...asset(100 + i, 'fans'),
    subject: null,
  }));
  const mixed = selectAssets([...players, ...scenes]);
  assert.equal(mixed.length, ASSETS_PER_MATCH);
  assert.equal(mixed.filter(item => item.motive === 'fans').length, 6);
  const generated = {
    ...asset(200, 'generated'),
    source: 'agnes',
    url: 'https://goatlab-gateway.fly.dev/media-gen/m-1/0.jpg',
    page: 'https://agnes-ai.com/',
    photographer: 'Agnes AI',
    photographerUrl: 'https://agnes-ai.com/',
    license: 'AI generated',
    subject: null,
  };
  const manifest = buildManifest({
    match: { webId: 'm-1', home: 'A', away: 'B' },
    assets: [...players.slice(0, 19), generated],
  });
  assert.ok(manifest.assets.some(item => item.source === 'agnes'));
  assert.match(manifest.attribution, new RegExp(AI_CREDIT.replace(/[()]/g, '\\$&')));
  assert.deepEqual(checkMediaManifest(manifest, { matchId: 'm-1' }), []);
  const bare = structuredClone(manifest);
  bare.attribution = bare.attribution.replace(AI_CREDIT, '');
  assert.ok(checkMediaManifest(bare).some(error => /generadas con IA/.test(error)));
});
