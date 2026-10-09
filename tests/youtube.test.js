import test from 'node:test';
import assert from 'node:assert/strict';
import { buildYoutubeScripts, selectMatches, staleScripts, sameCore, scriptFacts, missingScripts, acceptYoutubeDraft, youtubeUserPayload, shortTitle, playersInNarration, attentionPlayers, hashtagLine, youtubeCopy, telegramCaption, TITLE_MAX, buildPicks, matchVerdict } from '../src/lib/youtube.js';
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
    assert.equal(script.title, shortTitle({ home: 'Andorra', away: 'Malta', n: script.n, hook: script.hook }));
    assert.equal(script.title.includes(script.hook), false);
    assert.ok(Array.from(script.title).length <= TITLE_MAX);
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
  assert.ok(one.scripts[0].narration.includes('muestra todavía es corta'));
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

test('selectMatches con top elige clubes prioritarios y onlyMatch ignora el tope', () => {
  const rows = [
    { id: 'early', home: 'Leeds', away: 'Newcastle', status: 'NS', kickoff: '2026-09-14T19:00:00Z' },
    { id: 'madrid', home: 'Getafe', away: 'Real Madrid', status: 'NS', kickoff: '2026-09-14T23:00:00Z' },
    { id: 'barca', home: 'Barcelona', away: 'Sevilla', status: 'NS', kickoff: '2026-09-15T19:00:00Z' },
    { id: 'live', home: 'Arsenal', away: 'Chelsea', status: 'FT', kickoff: '2026-09-14T12:00:00Z' },
  ];
  assert.deepEqual(selectMatches(rows, { top: 2 }).map(m => m.id), ['madrid', 'barca']);
  assert.deepEqual(selectMatches(rows, { onlyMatch: 'early', top: 1 }).map(m => m.id), ['early']);
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
  assert.equal(facts.probability, null);
  assert.equal(facts.picks.length, 10);
  assert.ok(facts.picks.every(pick => pick && pick.bridge && pick.noun && pick.antecedent && pick.verdict && pick.call));
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
      narration: `${hook} Andorra ganó 1 de sus últimos 5. El cara a cara suma 4 duelos. La tensión se cocina a fuego lento mientras el análisis espera su veredicto con calma. La pregunta sigue abierta para este cruce de naciones esta noche. El análisis está en goatlab.win.`,
    };
  });
  const lede = 'Andorra recibe a Malta con 4 duelos ya jugados y la forma reciente de Andorra en 5 partidos.';
  assert.deepEqual(acceptYoutubeDraft({ scripts, lede }, { facts, published: false }), []);
  const invented = structuredClone(scripts);
  invented[0] = { ...invented[0], narration: `${invented[0].hook} Andorra marcaría 99 goles en una noche imposible de repetir. El cara a cara suma 4 duelos. La tensión se cocina a fuego lento mientras el análisis espera su veredicto con calma. La pregunta sigue abierta para este cruce de naciones esta noche. El análisis está en goatlab.win.` };
  assert.ok(acceptYoutubeDraft({ scripts: invented, lede }, { facts, published: false }).some(e => /cifra 99/.test(e)));
  const articled = structuredClone(scripts);
  articled[0] = { ...articled[0], hook: 'El Andorra llega entero frente a Malta hoy.', narration: 'El Andorra llega entero frente a Malta hoy. Andorra ganó 1 de sus últimos 5. El cara a cara suma 4 duelos. La tensión se cocina a fuego lento mientras el análisis espera su veredicto con calma. La pregunta sigue abierta para este cruce de naciones esta noche. El análisis está en goatlab.win.' };
  assert.ok(acceptYoutubeDraft({ scripts: articled, lede }, { facts, published: false }).some(e => /artículo/.test(e)));
  const named = {
    ...facts,
    players: { home: [{ name: 'Marc Vales', goals: 3, matches: 4 }], away: null },
  };
  const withPlayer = structuredClone(scripts);
  withPlayer[2] = {
    ...withPlayer[2],
    narration: `${withPlayer[2].hook} Andorra ganó 1 de sus últimos 5. Con Marc Vales en la cancha, el ambiente pesa. El cara a cara suma 4 duelos. La tensión se cocina a fuego lento mientras el análisis espera su veredicto con calma. La pregunta sigue abierta para este cruce de naciones esta noche. El análisis está en goatlab.win.`,
  };
  assert.deepEqual(acceptYoutubeDraft({ scripts: withPlayer, lede }, { facts: named, published: false }), []);
  const spilled = structuredClone(withPlayer);
  spilled[0] = { ...spilled[0], narration: `${spilled[0].hook} Marc Vales lleva 3 goles. El análisis está en goatlab.win.` };
  assert.ok(acceptYoutubeDraft({ scripts: spilled, lede }, { facts: named, published: false }).some(e => /va en un guion de jugadores/.test(e)));
});

test('título de clic con equipos o jugadores, distinto del gancho', () => {
  const hook = 'España llega con mejor racha que Croacia, aunque el visitante todavía tiene cómo discutirla.';
  const title = shortTitle({ home: 'España', away: 'Croacia', n: 1, hook });
  assert.ok(title.startsWith('🔥⚽ '));
  assert.ok(title.includes('España'));
  assert.ok(title.includes('Croacia'));
  assert.equal(title.includes(hook), false);
  assert.equal(hook.startsWith(title.replace(/^.*⚽\s*/, '')), false);
  assert.ok(Array.from(title).length <= TITLE_MAX);
  const narration = `${hook} En el gol mandan Lamine Yamal y Nico Williams. Esta noche se verá. Cuando quieras la pieza, ábrela en goatlab.win.`;
  const names = playersInNarration(narration, { home: 'España', away: 'Croacia' });
  assert.deepEqual(names, ['Lamine Yamal', 'Nico Williams']);
  assert.deepEqual(playersInNarration('Islas Feroe marcó 10 ante Moldavia.', { home: 'Moldavia', away: 'Islas Feroe' }), []);
  assert.deepEqual(playersInNarration('Creando desde la mediocancha, Nedim Bajrami es uno.', { home: 'San Marino', away: 'Albania' }), ['Nedim Bajrami']);
  const playerTitle = shortTitle({ home: 'España', away: 'Croacia', n: 9, hook, players: names });
  assert.ok(playerTitle.startsWith('✨⚽ '));
  assert.ok(playerTitle.includes('Lamine Yamal'));
  assert.ok(playerTitle.includes('Nico Williams'));
  assert.equal(playerTitle.includes(hook), false);
  const long = shortTitle({ home: 'España', away: 'Croacia', n: 10, hook: `${hook} ${hook} ${hook}` });
  assert.ok(long.startsWith('⏱️⚽ '));
  assert.equal(Array.from(long).length <= TITLE_MAX, true);
  assert.equal(telegramCaption({ title, hook }), `${title}\n${hook}`);
  assert.equal(telegramCaption({ hook }), hook);
  assert.equal(telegramCaption({ title: '', hook }).includes('#'), false);
});

test('hashtags de búsqueda y descripción con crédito de música', () => {
  const tags = hashtagLine({
    home: 'España',
    away: 'Croacia',
    competition: 'nations',
    players: ['Lamine Yamal', 'Álvaro Morata', 'Luka Modrić', 'Unai Simón'],
  });
  assert.equal(tags.split(' ').length <= 15, true);
  assert.ok(tags.startsWith('#España #Croacia #LamineYamal #ÁlvaroMorata #LukaModrić #UnaiSimón'));
  assert.ok(tags.includes('#goatlab'));
  assert.ok(tags.includes('#Shorts'));
  const ranked = attentionPlayers([
    { n: 3, narration: 'Álvaro Morata y Andrej Kramarić abren España contra Croacia.' },
    { n: 9, narration: 'Lamine Yamal y Nico Williams crean para España ante Croacia.' },
    { n: 4, narration: 'Unai Simón para el arco de España frente a Croacia.' },
  ], { home: 'España', away: 'Croacia' });
  assert.deepEqual(ranked, ['Álvaro Morata', 'Andrej Kramarić', 'Lamine Yamal', 'Nico Williams']);
  const copy = youtubeCopy({
    lede: 'España recibe a Croacia.\n#viejo\nhttps://goatlab.win/x',
    matchId: 'spain-vs-croatia-2026-09-29',
    home: 'España',
    away: 'Croacia',
    competition: 'nations',
    players: ['Lamine Yamal', 'Álvaro Morata', 'Luka Modrić', 'Unai Simón'],
    attribution: 'Ilustración referencial con Agnes AI',
    credit: 'Música: Kevin MacLeod (incompetech.com) — CC BY 4.0',
  });
  assert.ok(copy.startsWith('España recibe a Croacia.'));
  assert.equal((copy.match(/Más data:/g) ?? []).length, 1);
  assert.ok(copy.includes('https://goatlab.win/partido/spain-vs-croatia-2026-09-29'));
  assert.ok(copy.includes(tags));
  assert.ok(copy.includes('Ilustración referencial con Agnes AI'));
  assert.ok(copy.endsWith('Música: Kevin MacLeod (incompetech.com) — CC BY 4.0'));
  assert.equal(checkDescription(copy, { matchId: 'spain-vs-croatia-2026-09-29' }).length, 0);
});

test('staleScripts detecta rancios y sameCore ignora generatedAt', () => {
  assert.deepEqual(staleScripts(['a.json', 'b.json', 'x.txt'], ['a']), ['b.json']);
  assert.equal(sameCore({ a: 1, generatedAt: 'x' }, { a: 1, generatedAt: 'y' }), true);
  assert.equal(sameCore({ a: 1 }, { a: 2 }), false);
});

const richMatch = {
  id: 'test-1',
  webId: 'alpha-vs-beta-2026-10-10',
  competition: 'nations',
  home: 'Alpha',
  away: 'Beta',
  lastMatches: {
    home: [
      { date: '2026-10-01', home: 'Alpha', away: 'X', homeScore: 2, awayScore: 0 },
      { date: '2026-09-24', home: 'Y', away: 'Alpha', homeScore: 1, awayScore: 1 },
      { date: '2026-09-17', home: 'Alpha', away: 'Z', homeScore: 3, awayScore: 1 },
    ],
    away: [
      { date: '2026-10-01', home: 'Beta', away: 'W', homeScore: 0, awayScore: 0 },
      { date: '2026-09-24', home: 'Beta', away: 'V', homeScore: 1, awayScore: 2 },
    ],
  },
  h2h: { totalMatches: 6, homeWins: 3, draws: 1, awayWins: 2, avgTotalGoals: 2.5, recent: [{ date: '2026-01-01', home: 'Alpha', away: 'Beta', homeScore: 2, awayScore: 1 }] },
};
const richProb = {
  markets: {
    oneX2: { home: 0.5, draw: 0.27, away: 0.23 },
    totals: { over25: 0.6, under25: 0.4 },
    btts: { yes: 0.55, no: 0.45 },
    cleanSheet: { home: 0.4, away: 0.2 },
    exactScores: [{ home: 2, away: 1, p: 0.12 }, { home: 1, away: 0, p: 0.1 }, { home: 1, away: 1, p: 0.09 }],
  },
  firstGoal: { bands: [{ from: 0, to: 15, p: 0.35 }], noGoal: 0.03 },
  provider: { xg: { home: 1.9, away: 1.1 } },
};
const richScorers = { nations: { scorers: [{ player: 'Estrella Uno', team: 'Alpha', value: 4, matches: 5 }] } };

test('buildPicks asigna diez piezas con veredicto explícito y rotación', () => {
  const facts = scriptFacts(richMatch, richScorers, richProb);
  assert.equal(facts.picks.length, 10);
  assert.ok(facts.picks.every(pick => pick && pick.bridge && pick.noun && pick.antecedent && pick.verdict && pick.call));
  assert.ok(new Set(facts.picks.map(pick => pick.noun)).size > 1);
  assert.ok(new Set(facts.picks.map(pick => pick.bridge)).size > 1);
  for (const pick of facts.picks) {
    assert.ok(/la victoria de Alpha en casa|el empate/.test(pick.verdict), pick.verdict);
  }
  assert.ok(facts.picks[2].verdict.includes('2 a 1'));
  assert.ok(facts.picks[8].verdict.includes('2 a 1'));
  assert.equal(facts.picks[0].player, null);
  assert.equal(facts.picks[2].player, 'Estrella Uno');
  assert.equal(facts.picks[3].player, 'Estrella Uno');
  assert.equal(facts.picks[6].player, 'Estrella Uno');
  assert.equal(facts.picks[8].player, 'Estrella Uno');
  const bare = scriptFacts(richMatch);
  assert.ok(bare.picks.every(pick => pick && pick.player == null));
  assert.deepEqual(matchVerdict({}), null);
  assert.deepEqual(scriptFacts({ id: 'z', home: 'A', away: 'B', competition: 'nations' }).picks, Array(10).fill(null));
});

function assembleDraft(facts) {
  const hooks = [
    'Alpha y Beta marcan distinto y ganan distinto, y eso no cierra por ningún lado.',
    'El cara a cara entre Alpha y Beta pesa más de lo que parece.',
    'Alpha contra Beta huele a goles desde el sorteo del cruce.',
    'El arco en cero de Alpha contra Beta tiene un guardián claro.',
    'Beta visita a Alpha con la historia torcida en contra.',
    'Alpha y Beta ya se cruzaron y el recuerdo todavía quema.',
    'Lo que encaja Beta frente a Alpha abre una grieta visible.',
    'El empate asoma entre Alpha y Beta cada vez que se cruzan.',
    'Marcar no es ganar cuando Alpha recibe a Beta en casa.',
    'Desde el pitazo, Alpha contra Beta promete ritmo alto.',
  ];
  return hooks.map((hook, i) => {
    const pick = facts.picks[i];
    const tissue = i % 2
      ? 'El ritmo del cruce sostiene la tensión hasta el final del partido y nadie se guarda nada.'
      : 'Nadie regala nada cuando el ambiente aprieta de este modo en la cancha.';
    const playerBit = pick.player ? ` Con ${pick.player} en la cancha.` : '';
    return { hook, narration: `${hook} ${pick.bridge} ${pick.antecedent}.${playerBit} ${tissue} ${pick.noun} se queda con ${pick.verdict}. ${pick.call}` };
  });
}

test('borrador con piezas pasa; sin pronóstico, con cifras de más o con cero, no', () => {
  const facts = scriptFacts(richMatch, richScorers, richProb);
  const scripts = assembleDraft(facts);
  const lede = 'Alpha recibe a Beta con 6 cruces ya jugados y la forma reciente en 3 partidos.';
  assert.deepEqual(acceptYoutubeDraft({ scripts, lede }, { facts, published: false }), []);
  for (const script of scripts) {
    const words = script.narration.split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 55 && words <= 110, `${words} palabras`);
  }
  const noVerdict = structuredClone(scripts);
  noVerdict[0] = { ...noVerdict[0], narration: noVerdict[0].narration.replace(facts.picks[0].verdict, 'Alpha') };
  assert.ok(acceptYoutubeDraft({ scripts: noVerdict, lede }, { facts, published: false }).some(e => /pronóstico/.test(e)));
  const crowded = structuredClone(scripts);
  crowded[2] = { ...crowded[2], narration: `${crowded[2].narration} Dato extra con 7 figuras.` };
  assert.ok(acceptYoutubeDraft({ scripts: crowded, lede }, { facts, published: false }).some(e => /máximo 3/.test(e)));
  const zeroed = structuredClone(scripts);
  zeroed[2] = { ...zeroed[2], narration: `${zeroed[2].narration} Fueron 0 errores.` };
  assert.ok(acceptYoutubeDraft({ scripts: zeroed, lede }, { facts, published: false }).some(e => /cero/.test(e)));
  const hooked = structuredClone(scripts);
  hooked[3] = { ...hooked[3], hook: 'Alpha y Beta llegan con 9 goles cada uno.' };
  assert.ok(acceptYoutubeDraft({ scripts: hooked, lede }, { facts, published: false }).some(e => /gancho no lleva cifras/.test(e)));
  const nameless = structuredClone(scripts);
  nameless[2] = { ...nameless[2], narration: nameless[2].narration.replace(' Con Estrella Uno en la cancha.', '') };
  assert.ok(acceptYoutubeDraft({ scripts: nameless, lede }, { facts, published: false }).some(e => /Estrella Uno/.test(e)));
  const clipped = structuredClone(scripts);
  clipped[2] = { ...clipped[2], narration: clipped[2].narration.replace(`${facts.picks[2].antecedent}.`, 'El historial promedia 2,5 goles.') };
  assert.ok(acceptYoutubeDraft({ scripts: clipped, lede }, { facts, published: false }).some(e => /antecedente/.test(e)));
  const clippedScore = structuredClone(scripts);
  clippedScore[2] = { ...clippedScore[2], narration: clippedScore[2].narration.replace(`${facts.picks[2].verdict}.`, 'la victoria de Alpha en casa.') };
  assert.ok(acceptYoutubeDraft({ scripts: clippedScore, lede }, { facts, published: false }).some(e => /pronóstico/.test(e)));
});

test('plantilla con probabilidad lleva picks válidos y pasa compliance', () => {
  const out = buildYoutubeScripts(richMatch, richProb);
  assert.equal(out.scripts.length, 10);
  for (const script of out.scripts) {
    assert.ok(script.pick && script.pick.antecedent && script.pick.verdict);
    assert.ok(script.narration.includes(script.pick.verdict));
    assert.deepEqual(checkScript(script, { published: false, matchId: out.matchId }), []);
    assert.ok(script.words <= 110);
  }
  assert.deepEqual(checkDescription(out.description, { matchId: out.matchId }), []);
});
