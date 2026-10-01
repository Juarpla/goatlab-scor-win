import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMediaManifest } from '../src/lib/compliance.js';
import {
  playerNamesFromScripts,
  playerQueries,
  sceneQueries,
  selectAssets,
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
  buildSequences,
  subjectFor,
  PHOTOS_PER_SEQUENCE,
  CAMERA_MOVES,
  ASSETS_PER_MATCH,
  SEQUENCES_PER_MATCH,
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

test('playerNamesFromScripts lee los guiones de jugadores y omite los equipos', () => {
  const scripts = [];
  scripts[2] = {
    narration: 'Turquía contra Italia huele a partido abierto. Delante de esas cifras están Kenan Yıldız empujando el gol turco y Mateo Retegui como la referencia de Italia.',
  };
  scripts[3] = {
    narration: 'Y detrás de esa puerta está Gianluigi Donnarumma, cuyas atajadas sostienen el arco italiano.',
  };
  scripts[6] = {
    narration: 'Hakan Çalhanoğlu es quien cobra las faltas y en Italia ese papel ha recaído en Jorginho.',
  };
  scripts[8] = {
    narration: 'En el lado de la creación, Federico Dimarco llega desde Italia con centros.',
  };
  const names = playerNamesFromScripts(scripts, { home: 'Turquía', away: 'Italia' });
  assert.ok(names.includes('Kenan Yıldız'));
  assert.ok(names.includes('Mateo Retegui'));
  assert.ok(names.includes('Gianluigi Donnarumma'));
  assert.ok(names.includes('Hakan Çalhanoğlu'));
  assert.ok(names.includes('Jorginho'));
  assert.ok(names.includes('Federico Dimarco'));
  assert.ok(!names.includes('Turquía'));
  assert.ok(!names.includes('Italia'));
  assert.ok(playerQueries(names).some(q => q.query.includes('footballer') && q.player));
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
  assert.equal(normalizeCommonsPage(null, 'q'), null);
});

test('buildManifest arma 20 fotos, 10 secuencias distintas y atribución', () => {
  const assets = Array.from({ length: 24 }, (_, i) => asset(i, i < 3 ? 'training' : 'player'));
  const manifest = buildManifest({
    match: { webId: 'm-1', home: 'Türkiye', away: 'Italy', competition: 'nations', kickoff: '2026-09-28T18:45:00Z' },
    assets,
  });
  assert.equal(manifest.assets.length, ASSETS_PER_MATCH);
  assert.equal(manifest.assets[0].motive, 'training');
  assert.equal(manifest.sequences.length, SEQUENCES_PER_MATCH);
  assert.deepEqual(manifest.sequences.map(s => s.camera), CAMERA_MOVES);
  const orders = new Set(manifest.sequences.map(s => s.photos.join('|')));
  assert.equal(orders.size, SEQUENCES_PER_MATCH);
  assert.equal(manifest.sequences[0].photos.length, PHOTOS_PER_SEQUENCE);
  assert.equal(manifest.sequences[0].subjects.length, PHOTOS_PER_SEQUENCE);
  assert.match(manifest.attribution, /Wikimedia Commons \(CC BY 4.0\)/);
  assert.deepEqual(checkMediaManifest(manifest, { matchId: 'm-1' }), []);
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
  const stockAssets = Array.from({ length: 20 }, (_, i) => asset(i));
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
  assert.equal(buildSequences([], 'm-1').length, 0);
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
  assert.deepEqual(acceptVisionVerdict(
    { ok: true, who: 'Kenan Yıldız', motive: 'portrait' },
    { player: 'Kenan Yıldız' },
  ), { subject: 'Kenan Yıldız', motive: 'portrait' });
  assert.equal(acceptVisionVerdict({ ok: false, who: 'Kenan Yıldız', motive: 'portrait' }, { player: 'Kenan Yıldız' }), null);
  assert.equal(acceptVisionVerdict({ ok: true, who: 'Otro', motive: 'portrait' }, { player: 'Kenan Yıldız' }), null);
  assert.equal(acceptVisionVerdict({ ok: true, who: 'Kenan Yıldız', motive: 'player' }, { player: 'Kenan Yıldız' }), null);
  assert.deepEqual(acceptVisionVerdict(
    { ok: true, who: 'Jorginho', motive: 'after' },
    { names: ['Jorginho', 'Kenan Yıldız'] },
  ), { subject: 'Jorginho', motive: 'after' });
  assert.deepEqual(acceptVisionVerdict({ ok: true, motive: 'fans' }, {}), { subject: null, motive: 'fans' });
  assert.equal(acceptVisionVerdict({ ok: true, motive: 'logo' }, { scene: 'fans' }), null);
  assert.deepEqual(
    acceptVisionVerdict({ ok: true, motive: 'stadium' }, { scene: 'stadium' }),
    { subject: null, motive: 'stadium' },
  );
});

test('sceneQueries arma estadio, hinchas y prensa, y cae a la ciudad', () => {
  const withStadium = sceneQueries({
    home: 'Kazakhstan',
    away: 'Moldova',
    venue: { stadium: 'Astana Arena', city: 'Astana', country: 'Kazakhstan' },
  });
  assert.ok(withStadium.some(q => q.query === 'Kazakhstan fans' && q.scene === 'fans'));
  assert.ok(withStadium.some(q => q.query === 'Kazakhstan press conference' && q.scene === 'press'));
  assert.ok(withStadium.some(q => q.query === 'Astana Arena' && q.scene === 'stadium'));
  assert.ok(withStadium.some(q => /training/.test(q.query) && q.scene === 'training'));
  const cityOnly = sceneQueries({ home: 'Kazakhstan', away: 'Moldova', venue: { city: 'Astana' } });
  assert.ok(cityOnly.some(q => q.query === 'Astana stadium' && q.scene === 'stadium'));
  assert.ok(!cityOnly.some(q => q.scene === 'stadium' && q.query !== 'Astana stadium'));
  const countryOnly = sceneQueries({ home: 'Kazakhstan', away: 'Moldova', venue: { country: 'Kazakhstan' } });
  assert.ok(countryOnly.some(q => q.query === 'football stadium Kazakhstan'));
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
