import test from 'node:test';
import assert from 'node:assert/strict';
import { buildYoutubeScripts, selectMatches, staleScripts, sameCore, scriptFacts, missingScripts, acceptYoutubeDraft, youtubeUserPayload } from '../src/lib/youtube.js';
import { esName } from '../src/lib/teams.js';
import { checkScript, checkDescription } from '../src/lib/compliance.js';

const match = {
  id: 'bz-212589',
  webId: 'andorra-vs-malta-2026-09-24',
  competition: 'nations',
  home: 'Andorra',
  away: 'Malta',
  h2h: { totalMatches: 4, homeWins: 0, draws: 2, awayWins: 2, avgTotalGoals: 1.25 },
  lastMatches: {
    home: [
      { date: '2024-09-10T18:45:00+00:00', home: 'Andorra', away: 'Malta', homeScore: 0, awayScore: 1 },
      { date: '2020-11-14T14:00:00+00:00', home: 'Malta', away: 'Andorra', homeScore: 3, awayScore: 1 },
    ],
    away: [
      { date: '2024-11-19T19:45:00+00:00', home: 'Malta', away: 'Andorra', homeScore: 0, awayScore: 0 },
      { date: '2024-09-10T18:45:00+00:00', home: 'Andorra', away: 'Malta', homeScore: 0, awayScore: 1 },
    ],
  },
};

test('genera 10 guiones corridos que pasan compliance con gate cerrado', () => {
  const out = buildYoutubeScripts(match);
  assert.equal(out.scripts.length, 10);
  assert.equal(out.matchId, match.webId);
  for (const [i, script] of out.scripts.entries()) {
    assert.equal(script.n, i + 1);
    assert.ok(script.hook.length >= 10);
    assert.ok(script.narration.startsWith(script.hook));
    assert.ok(script.narration.includes('goatlab.win'));
    assert.equal(script.words, script.narration.split(/\s+/).filter(Boolean).length);
    assert.deepEqual(checkScript(script, { published: false, matchId: out.matchId }), []);
    assert.ok(!/%/.test(script.narration));
  }
  assert.deepEqual(checkDescription(out.description, { matchId: out.matchId }), []);
});

test('guiones bajo 50s y con CTA hablada', () => {
  const out = buildYoutubeScripts(match);
  for (const script of out.scripts) {
    assert.ok(script.words <= 110, `${script.words} palabras`);
    assert.ok(/goatlab\.win/.test(script.narration));
  }
});

test('sin datos igual entrega 10 narraciones honestas', () => {
  const out = buildYoutubeScripts({ id: 'bz-x', home: 'A', away: 'B', competition: 'nations' });
  assert.equal(out.scripts.length, 10);
  for (const script of out.scripts) {
    assert.deepEqual(checkScript(script, { published: false }), []);
  }
});

test('nombres de países en español y passthrough de desconocidos', () => {
  assert.equal(esName('England'), 'Inglaterra');
  assert.equal(esName('Spain'), 'España');
  assert.equal(esName('Rep. Of Ireland'), 'República de Irlanda');
  assert.equal(esName('Türkiye'), 'Turquía');
  assert.equal(esName('Equipo X'), 'Equipo X');
  const out = buildYoutubeScripts({ ...match, home: 'England', away: 'Spain' });
  const badArticle = /(^|\s)(el|al|del|este) (inglaterra|españa)\b/i;
  for (const script of out.scripts) {
    assert.ok(script.narration.includes('Inglaterra'));
    assert.ok(!script.narration.includes('England'));
    assert.ok(!script.narration.includes('Spain'));
    assert.ok(!badArticle.test(script.narration), `artículo con género: ${script.narration}`);
    assert.deepEqual(checkScript(script, { published: false }), []);
  }
  assert.ok(out.description.includes('Inglaterra contra España'));
  const one = buildYoutubeScripts({ id: 'z', home: 'Italy', away: 'France', competition: 'nations',
    lastMatches: { home: [{ date: '2026-09-01', home: 'Italy', away: 'Malta', homeScore: 1, awayScore: 0 }], away: [] } });
  assert.ok(one.scripts[0].narration.includes('con 1 gol a favor'));
});

test('selectMatches: todos los NS ordenados; --match y --limit recortan', () => {
  const rows = [
    { id: 'c', webId: 'c', status: 'NS', kickoff: '2026-09-26T00:00:00Z' },
    { id: 'a', webId: 'a', status: 'NS', kickoff: '2026-09-24T00:00:00Z' },
    { id: 'b', webId: 'b', status: 'FT', kickoff: '2026-09-23T00:00:00Z' },
  ];
  assert.deepEqual(selectMatches(rows).map(m => m.id), ['a', 'c']);
  assert.deepEqual(selectMatches(rows, { onlyMatch: 'c' }).map(m => m.id), ['c']);
  assert.deepEqual(selectMatches(rows, { limit: 1 }).map(m => m.id), ['a']);
});

test('scriptFacts no lleva porcentajes y missingScripts solo pide los que faltan', () => {
  const facts = scriptFacts(match);
  assert.equal(facts.home, 'Andorra');
  assert.equal(facts.away, 'Malta');
  assert.equal(facts.homeForm.gf, 1);
  assert.equal(facts.homeForm.ga, 4);
  assert.equal(facts.h2h.total, 4);
  assert.equal(facts.h2h.avgTotalGoals, 1.25);
  assert.equal(facts.players, null);
  assert.equal(JSON.stringify(facts).includes('%'), false);
  const withScorers = scriptFacts(
    { ...match, competition: 'nations', teamIds: { home: 1, away: 2 } },
    { nations: { scorers: [
      { player: 'Marc Vales', team: 'Andorra', teamId: 1, value: 3, matches: 4, assists: 2 },
      { player: 'Otro', team: 'Andorra', teamId: 1, value: 1, matches: 4 },
      { player: 'Sobra', team: 'Andorra', teamId: 1, value: 1, matches: 2 },
      { player: 'Kyrian Nwoko', team: 'Malta', teamId: 2, value: 2, matches: 3 },
      { player: 'Sin goles', team: 'Malta', teamId: 2, value: 0, matches: 3 },
    ] } },
  );
  assert.deepEqual(withScorers.players, {
    home: [{ name: 'Marc Vales', goals: 3, matches: 4, assists: 2 }, { name: 'Otro', goals: 1, matches: 4 }],
    away: [{ name: 'Kyrian Nwoko', goals: 2, matches: 3 }],
  });
  assert.equal(JSON.stringify(youtubeUserPayload({ published: false, facts })).includes('oneX2'), false);
  assert.deepEqual(
    missingScripts(
      [{ webId: 'a' }, { webId: 'b' }],
      ['a.json'],
    ).map(m => m.webId),
    ['b'],
  );
});

test('acceptYoutubeDraft deja pasar el relato y rechaza cifra inventada o artículo', () => {
  const facts = {
    home: 'Andorra',
    away: 'Malta',
    homeForm: { n: 5, wins: 1, draws: 2, losses: 2, gf: 2, ga: 4, clean: 2 },
    awayForm: null,
    h2h: { total: 4, homeWins: 0, awayWins: 2, draws: 2, avgTotalGoals: 1.25, last: null },
  };
  const angles = ['forma', 'historial', 'goles', 'arco', 'visita', 'cruce', 'defensa', 'empates', 'contraste', 'pitazo'];
  const scripts = angles.map((angle) => {
    const hook = `Andorra y Malta abren la lectura de ${angle} con la muestra encima.`;
    return {
      hook,
      narration: `${hook} Andorra ganó 1 de sus últimos 5, con 2 goles a favor. El cara a cara suma 4 duelos y promedia 1,25 goles. La pregunta sigue abierta. El análisis está en goatlab.win.`,
    };
  });
  const lede = 'Andorra recibe a Malta con 4 duelos ya jugados y la forma reciente de Andorra en 5 partidos.';
  assert.deepEqual(acceptYoutubeDraft({ scripts, lede }, { facts, published: false }), []);
  const invented = structuredClone(scripts);
  invented[0] = { ...invented[0], narration: `${invented[0].hook} Andorra marcaría 99 goles. El análisis está en goatlab.win.` };
  assert.ok(acceptYoutubeDraft({ scripts: invented, lede }, { facts, published: false }).some(e => /cifra 99/.test(e)));
  const articled = structuredClone(scripts);
  articled[0] = { ...articled[0], hook: 'El Andorra llega entero frente a Malta hoy.', narration: 'El Andorra llega entero frente a Malta hoy. Andorra ganó 1 de sus últimos 5. El análisis está en goatlab.win.' };
  assert.ok(acceptYoutubeDraft({ scripts: articled, lede }, { facts, published: false }).some(e => /artículo/.test(e)));
  const named = {
    ...facts,
    players: { home: [{ name: 'Marc Vales', goals: 3, matches: 4 }], away: null },
  };
  const withPlayer = structuredClone(scripts);
  withPlayer[2] = {
    ...withPlayer[2],
    narration: `${withPlayer[2].hook} Andorra ganó 1 de sus últimos 5. Marc Vales lleva 7 goles. La pregunta sigue abierta. El análisis está en goatlab.win.`,
  };
  assert.deepEqual(acceptYoutubeDraft({ scripts: withPlayer, lede }, { facts: named, published: false }), []);
  const spilled = structuredClone(withPlayer);
  spilled[0] = { ...spilled[0], narration: `${spilled[0].hook} Marc Vales lleva 3 goles. El análisis está en goatlab.win.` };
  assert.ok(acceptYoutubeDraft({ scripts: spilled, lede }, { facts: named, published: false }).some(e => /va en un guion de jugadores/.test(e)));
});

test('staleScripts detecta rancios y sameCore ignora generatedAt', () => {
  assert.deepEqual(staleScripts(['a.json', 'b.json', 'x.txt'], ['a']), ['b.json']);
  assert.equal(sameCore({ a: 1, generatedAt: 'x' }, { a: 1, generatedAt: 'y' }), true);
  assert.equal(sameCore({ a: 1 }, { a: 2 }), false);
});
