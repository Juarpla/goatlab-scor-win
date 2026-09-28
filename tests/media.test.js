import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMediaManifest } from '../src/lib/compliance.js';
import {
  playerNamesFromScripts,
  playerQueries,
  hashWebId,
  classifyLicense,
  normalizeCommonsPage,
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
  const banned = structuredClone(manifest);
  banned.assets[0].url = 'https://images.pexels.com/x.jpg';
  assert.ok(checkMediaManifest(banned).some(e => /dominio prohibido/.test(e)));
  assert.ok(checkMediaManifest(null).length > 0);
  assert.deepEqual(ALLOWED_SOURCES, ['commons']);
  assert.equal(subjectFor('Álvaro Morata', 'File:Alvaro_Morata_training.jpg'), 'Álvaro Morata');
  assert.equal(subjectFor('San', 'File:San_Siro.jpg'), null);
  assert.equal(subjectFor('Dennis Man', 'File:Flag_of_Romania.jpg'), null);
  assert.equal(buildSequences([], 'm-1').length, 0);
  assert.match(buildAttribution([{ source: 'commons', photographer: 'Ana', license: 'CC0' }]), /Ana/);
});
