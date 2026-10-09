/**
 * Guiones de Shorts (<50s). Estructura por guion: gancho del modelo +
 * piezas asignadas por código (puente, antecedente, sustantivo, pronóstico,
 * llamada) + tejido del modelo. buildYoutubeScripts arma la misma estructura
 * como plantilla de prueba. Sin porcentajes mientras el gate de publicación
 * siga cerrado (ver COMPLIANCE.md).
 */
import { DISCLAIMER, checkScript, checkText } from './compliance.js';
import { sameClub, esName, rankMatches } from './teams.js';

const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

/** Pluralización para lectura en voz alta ("1 empate", "3 locales"). */
function pl(n, one, many) {
  return Number(n) === 1 ? one : many;
}

function formLine(rows, team, count = 5) {
  const played = (rows ?? [])
    .filter(r => r.homeScore != null && r.awayScore != null && (sameClub(r.home, team) || sameClub(r.away, team)))
    .sort(byDateDesc)
    .slice(0, count);
  if (!played.length) return null;
  let wins = 0, draws = 0, gf = 0, ga = 0, clean = 0;
  for (const r of played) {
    const mine = sameClub(r.home, team) ? r.homeScore : r.awayScore;
    const theirs = sameClub(r.home, team) ? r.awayScore : r.homeScore;
    gf += mine;
    ga += theirs;
    if (mine > theirs) wins += 1;
    else if (mine === theirs) draws += 1;
    if (theirs === 0) clean += 1;
  }
  return { n: played.length, wins, draws, losses: played.length - wins - draws, gf, ga, clean };
}

const HOOKS = [
  (m) => `${m.home} contra ${m.away}: los números cuentan otra historia.`,
  (m) => `${m.home} contra ${m.away}: nadie lo mira, y debería.`,
  (m) => `${m.home} contra ${m.away} engaña: mira la forma.`,
  (m) => `¿Pocos goles en ${m.home} contra ${m.away}? Los datos responden.`,
  (m) => `El historial entre ${m.home} y ${m.away} pesa más de lo que crees.`,
  (m) => `Tres datos: ${m.home} contra ${m.away}.`,
  (m) => `${m.away} visita a ${m.home} con la historia en contra.`,
  (m) => `Arco en cero, la clave: ${m.home} contra ${m.away}.`,
  (m) => `Lo que ya jugaron dice mucho de este cruce: ${m.home} contra ${m.away}.`,
  (m) => `Últimos duelos, forma y goles: ${m.home} contra ${m.away}.`,
];

/** Puentes fijos: espejo de SKILL.md. El cuarto rota según el antecedente. */
const BRIDGES = [
  'Quédate con este dato.',
  'Este es el dato que manda.',
  'Acá está la clave.',
];
const BRIDGE_NUMBER = 'Guarda este número.';
const BRIDGE_WORDS = 'Guarda esta lectura.';
/** Sustantivos del pronóstico: espejo de SKILL.md. */
const NOUNS = ['La proyección', 'El análisis final', 'El diagnóstico final', 'La lectura'];
/** Llamadas fijas: espejo de SKILL.md §Llamadas. */
const CALLS = [
  'La lectura completa está en goatlab.win.',
  'El análisis de este cruce te espera en goatlab.win.',
  'Si quieres la data partida por partida, entra a goatlab.win.',
  'Toda la forma y el cara a cara están en goatlab.win.',
  'El detalle de este partido está en goatlab.win.',
  'Para seguir el hilo, entra a goatlab.win.',
  'Ahí está el análisis entero, en goatlab.win.',
  'La forma y el historial están en goatlab.win.',
  'Cuando quieras la pieza completa, ábrela en goatlab.win.',
  'El partido se cuenta con calma en goatlab.win.',
];
const RESERVE_TEXT = 'La muestra todavía es corta y conviene decirlo: sin serie reciente ni cruces previos, no hay antecedente que sostener. El análisis espera los datos. Cuando esa serie aparezca, la lectura va a poder afirmarse. Mientras tanto, la previa se cuenta con calma.';
/** Guiones que pueden nombrar jugadores (solo el nombre, sin promesas). */
const PLAYER_NS = new Set([3, 4, 7, 9]);
/** Guiones de goles: el pronóstico lleva el marcador del cálculo. */
const SCORE_NS = new Set([3, 9]);
const MAX_FIGURES = 3;
const MIN_WORDS = 55;
const rotationOf = id => [...String(id ?? '')].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % NOUNS.length;
const comma = value => String(value).replace('.', ',');
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
/** El antecedente abre frase: siempre en mayúscula inicial, sin punto final. */
const cap = value => value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

/** Fraseo de forma sin dígito cero (la regla lo prohíbe en voz alta). */
function formClause(form, name) {
  if (!form || !Number.isFinite(form.n) || form.n < 1) return null;
  if (form.n === 1) {
    if (form.wins === 1) return `${name} ganó su único partido reciente`;
    if (form.draws === 1) return `${name} empató su único partido reciente`;
    return `${name} perdió su único partido reciente`;
  }
  return form.wins === 0
    ? `${name} no ganó ninguno de sus últimos ${form.n}`
    : `${name} ganó ${form.wins} de sus últimos ${form.n}`;
}

/** Veredicto único del partido: lado + marcador coherente del cálculo. */
export function matchVerdict({ homeForm, awayForm, h2h, probability } = {}) {
  const oneX2 = probability?.markets?.oneX2 ?? null;
  let side = null;
  if (oneX2 && [oneX2.home, oneX2.draw, oneX2.away].every(Number.isFinite)) {
    const best = Math.max(oneX2.home, oneX2.draw, oneX2.away);
    const top = ['home', 'draw', 'away'].filter(k => oneX2[k] === best);
    side = top.length === 1 ? top[0] : null;
  }
  if (!side) {
    const hw = homeForm?.wins, aw = awayForm?.wins;
    if (Number.isFinite(hw) && Number.isFinite(aw) && hw !== aw) side = hw > aw ? 'home' : 'away';
    else if (Number.isFinite(h2h?.homeWins) && Number.isFinite(h2h?.awayWins) && h2h.homeWins !== h2h.awayWins) {
      side = h2h.homeWins > h2h.awayWins ? 'home' : 'away';
    }
  }
  if (!side) return null;
  const score = topScore(probability?.markets?.exactScores, side);
  return { side, score, scoreText: scoreFragment(score) };
}

function topScore(exactScores, side) {
  const rows = (exactScores ?? []).filter(e => Number.isFinite(e?.home) && Number.isFinite(e?.away));
  const fits = side === 'draw'
    ? rows.filter(e => e.home === e.away)
    : rows.filter(e => side === 'home' ? e.home > e.away : e.home < e.away);
  if (!fits.length) return null;
  return fits.reduce((a, b) => (b.p ?? 0) > (a.p ?? 0) ? b : a);
}

/** Fragmento de marcador sin dígito cero (1-0 es «por la mínima»). */
function scoreFragment(score) {
  if (!score) return null;
  const h = score.home, a = score.away;
  if (h === 0 && a === 0) return 'sin goles';
  if ((h === 1 && a === 0) || (h === 0 && a === 1)) return 'por la mínima';
  if (h === a) return `${h} a ${a}`;
  return Math.min(h, a) === 0 ? `por ${Math.max(h, a)}` : `${h} a ${a}`;
}

function outcomeText(verdict, home, away, withScore) {
  const frag = withScore ? verdict.scoreText : null;
  if (verdict.side === 'draw') return frag ? `el empate ${frag}` : 'el empate';
  const team = verdict.side === 'home' ? home : away;
  const venue = verdict.side === 'home' ? 'en casa' : 'de visita';
  return frag ? `la victoria de ${team} ${venue} ${frag}` : `la victoria de ${team} ${venue}`;
}

/** Un antecedente por ángulo: una frase, como máximo dos cifras. */
function angleAntecedent(n, { home: H, away: A, homeForm, awayForm, h2h, probability }) {
  const totals = probability?.markets?.totals ?? null;
  switch (n) {
    case 1: {
      const hw = homeForm?.wins, aw = awayForm?.wins;
      if (Number.isFinite(hw) && Number.isFinite(aw)) {
        if (hw === aw) {
          return hw === 0
            ? 'ninguno ganó: los dos llegan sin victorias'
            : `los dos ganaron ${hw} de ${homeForm.n > 0 ? homeForm.n : awayForm.n}`;
        }
        const lead = hw > aw ? formClause(homeForm, H) : formClause(awayForm, A);
        return `${lead} y ${hw > aw ? A : H} llega por detrás`;
      }
      return formClause(homeForm, H) ?? formClause(awayForm, A) ?? 'sin serie reciente a la vista, el análisis mira el cálculo';
    }
    case 2: {
      if (finite(h2h?.avgTotalGoals) > 0) return `el cara a cara promedia ${comma(Number(finite(h2h.avgTotalGoals).toFixed(2)))} goles`;
      if (finite(h2h?.avgTotalGoals) === 0) return 'el cara a cara promedia sin goles';
      if (h2h?.total > 0) {
        if (h2h.homeWins === h2h.awayWins) return `el cara a cara trae ${h2h.total} cruces parejos`;
        const [name, wins] = h2h.homeWins > h2h.awayWins ? [H, h2h.homeWins] : [A, h2h.awayWins];
        return `${name} manda el cara a cara con ${wins} de ${h2h.total}`;
      }
      return 'sin cruces previos, el historial no inclina nada';
    }
    case 3: {
      const over = finite(totals?.over25);
      const avg = finite(h2h?.avgTotalGoals) > 0
        ? `el historial promedia ${comma(Number(finite(h2h.avgTotalGoals).toFixed(2)))} goles`
        : 'el historial pide goles';
      const flavor = over == null ? '' : over >= 0.5 ? ', y el cálculo espera que se abra' : ', y el cálculo pide freno';
      return `${avg}${flavor}`;
    }
    case 4: {
      const hc = homeForm?.clean ?? 0, ac = awayForm?.clean ?? 0;
      const best = hc >= ac ? (hc > 0 ? [H, hc, homeForm.n] : null) : (ac > 0 ? [A, ac, awayForm.n] : null);
      return best ? `${best[0]} dejó el arco en cero en ${best[1]} de ${best[2]}` : 'sin arcos en cero en la serie reciente';
    }
    case 5:
      return formClause(awayForm, A) ?? 'la visita llega sin serie reciente';
    case 6: {
      const last = h2h?.last;
      if (last && Number.isFinite(last.homeScore) && Number.isFinite(last.awayScore)) {
        const hs = last.homeScore, as = last.awayScore;
        if (hs === 0 && as === 0) return 'el último cruce terminó sin goles';
        if (hs === as) return `el último cruce terminó ${hs} a ${as}`;
        const winner = hs > as ? last.home : last.away;
        const max = Math.max(hs, as);
        if (Math.min(hs, as) === 0) return `${winner} goleó el último por ${max}`;
        return `${winner} ganó el último por ${hs} a ${as}`;
      }
      return 'no hay último cruce que pese';
    }
    case 7: {
      const cand = [];
      if (Number.isFinite(homeForm?.ga) && homeForm.n > 0) cand.push([H, homeForm.ga, homeForm.n]);
      if (Number.isFinite(awayForm?.ga) && awayForm.n > 0) cand.push([A, awayForm.ga, awayForm.n]);
      if (!cand.length) return 'sin serie de goles encajados a la vista';
      cand.sort((a, b) => b[1] - a[1]);
      const [name, ga, games] = cand[0];
      return ga === 0 ? `${name} llega sin encajar en sus últimos ${games}` : `${name} encajó ${ga} en sus últimos ${games}`;
    }
    case 8: {
      if (homeForm?.draws > 0) return `${H} empató ${homeForm.draws} de ${homeForm.n}`;
      if (awayForm?.draws > 0) return `${A} empató ${awayForm.draws} de ${awayForm.n}`;
      if (h2h?.draws > 0) return `el cara a cara dejó ${h2h.draws} empates en ${h2h.total}`;
      return 'sin empates en la serie reciente';
    }
    case 9: {
      const hgf = homeForm?.gf, agf = awayForm?.gf;
      if (hgf > 0 || agf > 0) {
        const [name, gf] = (hgf ?? 0) >= (agf ?? 0) ? [H, hgf] : [A, agf];
        return `${name} marcó ${gf} ${pl(gf, 'gol', 'goles')} y no siempre los convirtió en victorias`;
      }
      return 'marcar no alcanzó para ganar últimamente';
    }
    default: {
      if (homeForm && awayForm) return `los dos traen ${Math.max(homeForm.n, awayForm.n)} partidos recientes`;
      return 'la serie reciente está por escribirse';
    }
  }
}

/** Matiz del ángulo sobre el veredicto, solo con respaldo en los datos. */
function angleQualifier(n, { homeForm, awayForm, probability }, verdict) {
  if (n === 4) {
    const hc = homeForm?.clean ?? 0, ac = awayForm?.clean ?? 0;
    if (hc === 0 && ac === 0) return '';
    const cleanSide = hc >= ac ? 'home' : 'away';
    return verdict.side === cleanSide ? ', con el arco en cero como candado' : '';
  }
  if (n === 7) {
    const early = finite(probability?.firstGoal?.bands?.[0]?.p);
    return early != null && early >= 0.3 ? ', con el primer gol cayendo temprano' : '';
  }
  if (n === 8) {
    const draw = finite(probability?.markets?.oneX2?.draw);
    return draw != null && draw >= 0.3 && verdict.side !== 'draw' ? ', pero el empate asoma' : '';
  }
  if (n === 10) {
    const xg = probability?.provider?.xg;
    const sum = finite(xg?.home) != null && finite(xg?.away) != null ? finite(xg.home) + finite(xg.away) : null;
    if (sum == null) return '';
    return sum >= 2.8 ? ', con arranque abierto' : ', con arranque trabado';
  }
  return '';
}

/**
 * Las diez piezas asignadas (una por guion) o diez nulos cuando no hay
 * veredicto: sin forma, sin historial y sin probabilidades no hay pronóstico
 * y el skill usa sus temas de reserva.
 */
export function buildPicks(match, scorers = null, probability = null) {
  const base = baseFacts(match, scorers);
  const verdict = matchVerdict({ ...base, probability });
  const offset = rotationOf(match?.webId ?? match?.id);
  return Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    if (!verdict) return null;
    const ctx = { ...base, probability, verdict };
    const antecedent = angleAntecedent(n, ctx);
    if (!antecedent) return null;
    const bridgeSlot = (offset + n - 1) % (BRIDGES.length + 1);
    const bridge = bridgeSlot < BRIDGES.length
      ? BRIDGES[bridgeSlot]
      : (/\d/.test(antecedent) ? BRIDGE_NUMBER : BRIDGE_WORDS);
    return {
      n,
      bridge,
      noun: NOUNS[(offset + n) % NOUNS.length],
      antecedent: cap(antecedent),
      verdict: outcomeText(verdict, base.home, base.away, SCORE_NS.has(n)) + angleQualifier(n, ctx, verdict),
      player: PLAYER_NS.has(n) ? (playerNames(base)[0] ?? null) : null,
      call: CALLS[i],
    };
  });
}

export function countWords(text) {
  return String(text ?? '').split(/\s+/).filter(Boolean).length;
}

/** Narración corrida lista para leer: gancho + piezas + tejido + llamada. */
export function buildNarration(names, pick, i) {
  const hook = HOOKS[i % HOOKS.length](names);
  if (!pick) {
    const narration = `${hook} ${RESERVE_TEXT} ${CALLS[0]}`;
    return { hook, narration, words: countWords(narration) };
  }
  const playerBit = pick.player ? ` Con ${pick.player} en la cancha.` : '';
  const narration = `${hook} ${pick.bridge} ${pick.antecedent}.${playerBit} ${pick.noun} se queda con ${pick.verdict}. ${pick.call}`;
  return { hook, narration, words: countWords(narration) };
}

/** Selección de la corrida. Sin `top`: todos los NS de la ventana (fixtures.json ya es 7 días).
 *  Con `top`: los NS más relevantes, vueltos a ordenar por kickoff.
 *  `onlyMatch` ignora el ranking y el tope. */
export function selectMatches(matches, { onlyMatch = null, limit = null, top = null } = {}) {
  let out = (matches ?? []).filter(m => m.status === 'NS');
  if (onlyMatch) out = out.filter(m => m.id === onlyMatch || m.webId === onlyMatch);
  else if (top != null && Number.isFinite(Number(top))) out = rankMatches(out).slice(0, Math.max(1, Number(top)));
  out = out.sort((a, b) => (a.kickoff < b.kickoff ? -1 : 1));
  return limit == null ? out : out.slice(0, Math.max(1, Number(limit)));
}

/** Archivos rancios: JSONs cuyo id ya no está vigente en fixtures. */
export function staleScripts(files, liveIds) {
  const live = new Set(liveIds);
  return (files ?? []).filter(f => f.endsWith('.json') && !live.has(f.replace(/\.json$/, '')));
}

/** Igualdad de contenido ignorando generatedAt (escritura silenciosa). */
export function sameCore(prev, next) {
  const { generatedAt: _a, ...a } = prev ?? {};
  const { generatedAt: _b, ...b } = next ?? {};
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Hasta dos goleadores por lado, copiados de la tabla de la competición. */
function sideScorers(table, competition, team, teamId, limit = 2) {
  const rows = (table?.[competition]?.scorers ?? [])
    .filter(row => row?.player && Number.isFinite(Number(row.value)) && Number(row.value) > 0)
    .filter(row => (teamId != null && row.teamId === teamId) || sameClub(row.team, team))
    .sort((a, b) => Number(b.value) - Number(a.value) || String(a.player).localeCompare(String(b.player), 'es'));
  const picked = [];
  const seen = new Set();
  for (const row of rows) {
    const name = String(row.player).trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const player = {
      name,
      goals: Number(row.value),
      matches: Number.isFinite(Number(row.matches)) ? Number(row.matches) : null,
    };
    if (Number.isFinite(Number(row.assists)) && Number(row.assists) > 0) player.assists = Number(row.assists);
    picked.push(player);
    if (picked.length === limit) break;
  }
  return picked.length ? picked : null;
}

function importantPlayers(match, scorers) {
  if (!scorers || !match?.competition) return null;
  const home = sideScorers(scorers, match.competition, match.home, match.teamIds?.home ?? null);
  const away = sideScorers(scorers, match.competition, match.away, match.teamIds?.away ?? null);
  if (!home && !away) return null;
  return { home, away };
}

function playerNames(facts) {
  return [facts?.players?.home, facts?.players?.away]
    .flatMap(side => side ?? [])
    .map(row => row?.name)
    .filter(Boolean);
}

/** Guiones 3, 4, 7 y 9: ahí el relato puede nombrar jugadores y usar cifras buscadas. */
const PLAYER_SCRIPT_INDEXES = new Set([2, 3, 6, 8]);

/** Hechos que el modelo puede decir. Sin porcentajes ni lectura de apuesta.
 *  `players` sale de la tabla de goleadores de la competición; null si no hay filas. */
function baseFacts(match, scorers = null) {
  const home = esName(match.home);
  const away = esName(match.away);
  const homeForm = formLine(match.lastMatches?.home, match.home);
  const awayForm = formLine(match.lastMatches?.away, match.away);
  let h2h = null;
  if (match.h2h?.totalMatches) {
    const recent = [...(match.h2h.recent ?? [])]
      .filter(r => r.homeScore != null && r.awayScore != null)
      .sort(byDateDesc)[0] ?? null;
    h2h = {
      total: match.h2h.totalMatches,
      homeWins: match.h2h.homeWins ?? 0,
      awayWins: match.h2h.awayWins ?? 0,
      draws: match.h2h.draws ?? 0,
      avgTotalGoals: match.h2h.avgTotalGoals == null ? null : Number(Number(match.h2h.avgTotalGoals).toFixed(2)),
      last: recent ? {
        home: sameClub(recent.home, match.home) ? home : sameClub(recent.home, match.away) ? away : esName(recent.home),
        away: sameClub(recent.away, match.home) ? home : sameClub(recent.away, match.away) ? away : esName(recent.away),
        homeScore: recent.homeScore,
        awayScore: recent.awayScore,
      } : null,
    };
  }
  return { home, away, homeForm, awayForm, h2h, players: importantPlayers(match, scorers) };
}

/**
 * Hechos + piezas asignadas + probabilidades del partido (el modelo solo
 * puede citar las cifras de su pieza; el lint lo verifica).
 */
export function scriptFacts(match, scorers = null, probability = null) {
  return { ...baseFacts(match, scorers), probability: probability ?? null, picks: buildPicks(match, scorers, probability) };
}

/** Partidos de la corrida que todavía no tienen un JSON con 10 guiones. */
export function missingScripts(matches, files) {
  const have = new Set((files ?? []).filter(f => String(f).endsWith('.json')).map(f => f.replace(/\.json$/, '')));
  return (matches ?? []).filter(m => !have.has(m.webId ?? m.id));
}

export function youtubeUserPayload({ published, facts }) {
  return { published: published === true, facts };
}

function walkNumbers(value, into) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    into.add(Number.isInteger(value) ? value : Number(value.toFixed(2)));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const item of Object.values(value)) walkNumbers(item, into);
}

export function allowedNumbers(facts) {
  const into = new Set();
  walkNumbers(facts, into);
  return into;
}

export function numbersInText(text) {
  return [...String(text ?? '').matchAll(/\d+(?:[.,]\d+)?/g)]
    .map(m => Number(m[0].replace(',', '.')))
    .filter(n => Number.isFinite(n));
}

function numberAllowed(n, allowed) {
  for (const candidate of allowed) {
    if (Math.abs(candidate - n) < 0.001) return true;
  }
  return false;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function cleanLede(lede) {
  return String(lede ?? '')
    .replaceAll(DISCLAIMER, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#\S+/g, '')
    .replace(/🔗/g, '')
    .replace(/Más data:\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function competitionTag(competition) {
  return `#${String(competition ?? 'futbol').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

/** Hashtag de un equipo: sin espacios. */
export function teamTag(name) {
  const tag = String(name ?? '').replace(/\s+/g, '').replace(/[^\p{L}\p{N}_]/gu, '');
  return tag ? `#${tag}` : '';
}

const COMPETITION_TAGS = {
  nations: ['#UEFANationsLeague', '#selecciones', '#UEFA', '#NationsLeague', '#LigaDeNaciones'],
};

const HASHTAG_CAP = 15;

/** Hashtags de alta búsqueda. Equipos y jugadores van delante: YouTube ignora la lista si pasa de 15. */
export function hashtagLine({ home, away, competition, players } = {}) {
  const comp = COMPETITION_TAGS[competition] ?? [competitionTag(competition)];
  const playerTags = (players ?? []).slice(0, 4).map(teamTag).filter(Boolean);
  const head = [teamTag(home), teamTag(away), ...playerTags, '#Shorts', '#goatlab'];
  const tail = [
    '#futbol', '#fútbol', '#soccer', '#goles', '#previa',
    ...comp,
    '#football', '#analisis', '#YouTubeShorts', '#deporte', '#deportes',
  ];
  return [...new Set([...head, ...tail].filter(Boolean))].slice(0, HASHTAG_CAP).join(' ');
}

export function buildDescription({ lede, matchId, competition, home, away, players }) {
  return [
    cleanLede(lede),
    `🔗 Más data: https://goatlab.win/partido/${matchId}`,
    hashtagLine({ home, away, competition, players }),
    DISCLAIMER,
  ].join('\n');
}

/** Descripción que se copia en /partido/id/youtube. El crédito sale de bed.txt. */
export function youtubeCopy({ lede, matchId, home, away, competition, players, attribution, credit }) {
  const lines = [buildDescription({ lede, matchId, competition, home, away, players })];
  const photo = String(attribution ?? '').trim();
  const music = String(credit ?? '').trim();
  if (photo) lines.push(photo);
  if (music) lines.push(music);
  return lines.join('\n');
}

const TITLE_ICONS = ['🔥', '👀', '⚡', '🧤', '✈️', '⏪', '🧱', '🤝', '✨', '⏱️'];
export const TITLE_MAX = 100;

const NAME_STOP = new Set([
  'ahí', 'ahi', 'al', 'aunque', 'antes', 'asi', 'así', 'como', 'cómo', 'con', 'cual', 'cuál',
  'cuando', 'de', 'del', 'despues', 'después', 'detras', 'detrás', 'donde', 'dónde', 'el',
  'en', 'entre', 'esa', 'esas', 'ese', 'eso', 'esos', 'esta', 'estas', 'este', 'estos',
  'hay', 'la', 'las', 'lo', 'los', 'mas', 'más', 'mientras', 'ni', 'ojo', 'para', 'pero',
  'por', 'que', 'qué', 'quien', 'quién', 'si', 'sin', 'sobre', 'su', 'sus', 'tambien',
  'también', 'toda', 'todas', 'todavia', 'todavía', 'todo', 'todos', 'un', 'una', 'y',
]);

function teamWords(home, away) {
  const words = new Set();
  for (const name of [home, away]) {
    const lower = String(name ?? '').toLowerCase();
    if (lower) words.add(lower);
    for (const word of lower.split(/\s+/)) {
      if (word.length >= 3) words.add(word);
    }
  }
  return words;
}

function isNameToken(word, teams) {
  if (!word || word.length < 3) return false;
  const lower = word.toLowerCase();
  if (teams.has(lower) || NAME_STOP.has(lower)) return false;
  return /^[\p{Lu}][\p{L}\p{M}’'.-]+$/u.test(word) && /\p{Ll}/u.test(word);
}

/** Nombres propios de la narración que no son los equipos. */
export function playersInNarration(narration, { home, away } = {}) {
  const teams = teamWords(home, away);
  const found = [];
  let buf = [];
  const flush = () => {
    if (buf.length === 1 && /(?:ando|iendo|yendo)$/iu.test(buf[0])) {
      buf = [];
      return;
    }
    if (buf.length) found.push(buf.join(' '));
    buf = [];
  };
  for (const raw of String(narration ?? '').split(/\s+/)) {
    const word = raw.replace(/^[«"“(\[]+|[»"”),:;.!?]+$/g, '');
    if (isNameToken(word, teams)) buf.push(word);
    else flush();
  }
  flush();
  return collapseNames(found.filter(name => !teams.has(name.toLowerCase())));
}

function collapseNames(names) {
  const unique = [...new Set(names.filter(Boolean))];
  return unique.filter(name => !unique.some(other => other !== name && other.toLowerCase().includes(name.toLowerCase())));
}

/** Hasta cuatro jugadores de los guiones 3, 4, 7 y 9, goles y creación primero. */
export function attentionPlayers(scripts, { home, away } = {}) {
  const order = [3, 9, 7, 4];
  const ranked = [];
  for (const n of order) {
    const script = (scripts ?? []).find(item => Number(item?.n) === n);
    if (!script) continue;
    for (const name of playersInNarration(script.narration, { home, away })) {
      if (!ranked.includes(name)) ranked.push(name);
    }
  }
  return collapseNames(ranked).slice(0, 4);
}

function clickLine(n, { home, away, names }) {
  const vs = `${home} vs ${away}`;
  const who = names.slice(0, 2);
  const pair = who.length === 2 ? `${who[0]} y ${who[1]}` : who[0];
  const lines = [
    `¿${home} o ${away}? Uno llega más caliente`,
    `${vs}: el historial que no te cuentan`,
    pair ? `${pair}: ¿quién marca en ${vs}?` : `${vs}: ¿se abre el marcador?`,
    pair ? `${pair}: ¿aguanta el arco en ${vs}?` : `¿Quién cierra el arco en ${vs}?`,
    `${away} llega a ${home}: ¿alcanza la visita?`,
    `${vs}: ¿se repite el último golpe?`,
    pair ? `${pair} ${who.length > 1 ? 'pueden' : 'puede'} decidir ${vs}` : `${vs}: el primer gol lo cambia`,
    `${vs}: cuidado, puede terminar en empate`,
    pair ? `${pair} en ${vs}` : `${vs}: marcar no es ganar`,
    `${vs}: lo único que importa al pitazo`,
  ];
  return lines[(Math.max(1, Number(n) || 1) - 1) % lines.length];
}

function sharesOpening(title, hook) {
  const norm = (value) => String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const left = norm(title).split(' ').slice(0, 6).join(' ');
  const right = norm(hook).split(' ').slice(0, 6).join(' ');
  if (!left || !right) return false;
  return right.startsWith(left) || left.startsWith(right);
}

function clipTitle(prefix, text) {
  const budget = TITLE_MAX - Array.from(prefix).length;
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (Array.from(clean).length <= budget) return prefix + clean;
  let out = '';
  for (const word of clean.split(' ')) {
    const next = out ? `${out} ${word}` : word;
    if (Array.from(next).length > budget) break;
    out = next;
  }
  return prefix + (out || Array.from(clean).slice(0, budget).join(''));
}

/**
 * Título de clic del Short. No repite el gancho: nombra a los equipos
 * o a los jugadores de ese guion, con dos iconos y tope de 100.
 */
export function shortTitle({ home, away, n, hook, players = [] } = {}) {
  const icon = TITLE_ICONS[(Math.max(1, Number(n) || 1) - 1) % TITLE_ICONS.length];
  const prefix = `${icon}⚽ `;
  const names = collapseNames(players).slice(0, 2);
  const ctx = { home, away, names };
  const line = sharesOpening(clickLine(n, ctx), hook)
    ? (names.length ? `No te pierdas a ${names.join(' y ')} en ${home} vs ${away}` : `${home} vs ${away}: la previa que engancha`)
    : clickLine(n, ctx);
  return clipTitle(prefix, line);
}

/** Pie de Telegram: título y gancho. Sin título, solo el gancho. */
export function telegramCaption({ title, hook, attribution, musicCredit } = {}) {
  const head = String(title ?? '').trim();
  const line = String(hook ?? '').trim();
  const text = head && line && head !== line ? `${head}\n${line}` : (head || line);
  if (!attribution && !musicCredit) return text.slice(0, 1000);
  const credits = String(attribution ?? '').trim();
  const complete = [text.slice(0, 220), String(musicCredit ?? '').trim(), credits].filter(Boolean).join('\n');
  if (complete.length <= 1024) return complete;
  const ai = credits.split('\n').filter(line => /generad|Agnes|inteligencia artificial/i.test(line)).join('\n');
  return [text.slice(0, 220), String(musicCredit ?? '').trim(), ai.slice(0, 400), 'Créditos completos en el archivo adjunto.'].filter(Boolean).join('\n').slice(0, 1024);
}

/**
 * Rechaza un borrador del modelo si no se puede leer en voz alta,
 * inventa cifras o rompe el gate. Con pieza asignada también exige sus
 * textos tal cual, gancho sin cifras, tope de 3 cifras y piso de 55
 * palabras. Devuelve la lista de fallos.
 */
export function acceptYoutubeDraft(draft, { facts, published = false } = {}) {
  const errors = [];
  const scripts = draft?.scripts;
  if (!Array.isArray(scripts) || scripts.length !== 10) errors.push('hacen falta 10 guiones');
  const allowed = allowedNumbers(facts);
  const names = [facts?.home, facts?.away].filter(Boolean);
  const players = playerNames(facts);
  const hooks = new Set();
  for (const [i, script] of (scripts ?? []).entries()) {
    const hook = String(script?.hook ?? '').trim();
    const narration = String(script?.narration ?? '').trim();
    const label = `guion ${i + 1}`;
    if (hooks.has(hook)) errors.push(`${label}: gancho repetido`);
    if (hook) hooks.add(hook);
    if (hook && narration && !narration.startsWith(hook)) errors.push(`${label}: la narración no abre con el gancho`);
    for (const name of names) {
      if (!narration.includes(name)) errors.push(`${label}: falta ${name}`);
      const article = new RegExp(`(?:^|\\s)(?:el|al|del|este|la|los|las)\\s+${escapeRegExp(name)}\\b`, 'i');
      if (article.test(`${hook} ${narration}`)) errors.push(`${label}: artículo delante de ${name}`);
    }
    for (const name of players) {
      const article = new RegExp(`(?:^|\\s)(?:el|al|del|este|la|los|las)\\s+${escapeRegExp(name)}\\b`, 'i');
      if (article.test(`${hook} ${narration}`)) errors.push(`${label}: artículo delante de ${name}`);
      const mentioned = hook.includes(name) || narration.includes(name);
      if (mentioned && !PLAYER_SCRIPT_INDEXES.has(i)) errors.push(`${label}: ${name} va en un guion de jugadores`);
    }
    const text = `${hook} ${narration}`;
    const figures = numbersInText(text);
    for (const n of figures) {
      if (n === 0) errors.push(`${label}: el cero no se escribe en dígitos`);
      else if (!numberAllowed(n, allowed)) errors.push(`${label}: cifra ${n} no está en los hechos`);
    }
    if (figures.length > MAX_FIGURES) errors.push(`${label}: ${figures.length} cifras, máximo ${MAX_FIGURES}`);
    const words = narration.split(/\s+/).filter(Boolean).length;
    if (words < MIN_WORDS) errors.push(`${label}: ${words} palabras, mínimo ${MIN_WORDS}`);
    const pick = facts?.picks?.[i] ?? null;
    if (pick) {
      for (const [field, name] of [['bridge', 'puente'], ['noun', 'sustantivo'], ['antecedent', 'antecedente'], ['verdict', 'pronóstico'], ['call', 'llamada']]) {
        const value = String(pick[field] ?? '').trim();
        if (!value) errors.push(`${label}: falta ${name} asignado`);
        else if (!text.includes(value)) errors.push(`${label}: falta el ${name} asignado`);
      }
      if (pick.player && !text.includes(pick.player)) errors.push(`${label}: falta ${pick.player}`);
      if (numbersInText(hook).length) errors.push(`${label}: el gancho no lleva cifras`);
    }
    for (const error of checkScript({ hook, narration }, { published })) errors.push(`${label}: ${error}`);
  }
  const lede = cleanLede(draft?.lede);
  if (!lede) errors.push('falta la entrada de la descripción');
  else {
    for (const name of names) {
      if (!lede.includes(name)) errors.push(`descripción: falta ${name}`);
    }
    for (const n of numbersInText(lede)) {
      if (!numberAllowed(n, allowed)) errors.push(`descripción: cifra ${n} no está en los hechos`);
    }
    for (const hit of checkText(lede)) errors.push(`descripción: vocabulario prohibido: ${hit}`);
    if (!published && /%/.test(lede)) errors.push('descripción: porcentajes bloqueados');
  }
  return errors;
}

/** Diez guiones + descripción lista para YouTube (nombres en español). */
export function buildYoutubeScripts(match, probability = null) {
  const webId = match.webId ?? match.id;
  const names = { ...match, home: esName(match.home), away: esName(match.away) };
  const picks = buildPicks(match, null, probability);
  const scripts = picks.map((pick, i) => {
    const n = i + 1;
    const { hook, narration, words } = buildNarration(names, pick, i);
    const entry = { n, hook, title: shortTitle({ home: names.home, away: names.away, n, hook }), narration, words };
    if (pick) entry.pick = { bridge: pick.bridge, noun: pick.noun, antecedent: pick.antecedent, verdict: pick.verdict, player: pick.player ?? null, call: pick.call };
    return entry;
  });
  const first = picks.find(pick => pick);
  const description = buildDescription({
    lede: [`${names.home} contra ${names.away}: forma, goles y cara a cara en menos de un minuto.`, first ? `${first.noun} se queda con ${first.verdict}.` : ''].filter(Boolean).join(' '),
    matchId: webId,
    competition: match.competition,
    home: names.home,
    away: names.away,
  });
  return { matchId: webId, providerId: match.id, scripts, description };
}
