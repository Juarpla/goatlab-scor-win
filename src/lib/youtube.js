/**
 * Guiones de Shorts (<50s). La acción no reescribe un JSON ya existente:
 * los faltantes los redacta el modelo de turno con el skill
 * redactar-guiones-shorts. buildYoutubeScripts queda como plantilla de
 * prueba. Sin porcentajes mientras el gate de publicación siga cerrado
 * (ver COMPLIANCE.md).
 */
import { DISCLAIMER, checkScript, checkText } from './compliance.js';
import { sameClub, esName } from './teams.js';

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

const CONNECTORS = [
  'Mira este dato:',
  'Y ojo:',
  'Pero hay más:',
  'El dato clave:',
  'Ahora compara:',
  'Y esto pesa:',
  'Suma esto:',
  'La otra cara:',
  'Y atención:',
  'Para completar:',
];

const SPOKEN_CTAS = [
  'Todo el análisis, partido por partido, en goatlab.win.',
  'Tablas, forma y el veredicto completo en goatlab.win.',
  'Más data del cruce en goatlab.win.',
];

const CLOSERS = [
  'La forma actual contra el historial: ahí está la lectura.',
  'Goles recientes contra cruces previos: esa es la lectura.',
  'Lo que ya jugaron manda más que el nombre.',
];

function metricBeats(match) {
  const beats = [];
  // Lógica con nombres crudos (sameClub); impresión en español (esName).
  const H = esName(match.home);
  const A = esName(match.away);
  const home = formLine(match.lastMatches?.home, match.home);
  const away = formLine(match.lastMatches?.away, match.away);
  if (home) beats.push(`${H} ganó ${home.wins} de sus últimos ${home.n}, con ${home.gf} ${pl(home.gf, 'gol', 'goles')} a favor.`);
  if (away) beats.push(`${A} ganó ${away.wins} de sus últimos ${away.n}, con ${away.gf} ${pl(away.gf, 'gol', 'goles')} a favor.`);
  if (home?.clean || away?.clean) {
    const clean = Math.max(home?.clean ?? 0, away?.clean ?? 0);
    const side = (home?.clean ?? 0) >= (away?.clean ?? 0) ? H : A;
    beats.push(`El arco en cero apareció ${clean} ${pl(clean, 'vez', 'veces')}: ${side} defiende bien.`);
  }
  const h2h = match.h2h;
  if (h2h?.totalMatches) {
    beats.push(`El cara a cara suma ${h2h.totalMatches} duelos: ${h2h.homeWins} ${pl(h2h.homeWins, 'local', 'locales')}, ${h2h.draws} ${pl(h2h.draws, 'empate', 'empates')}.`);
    if (h2h.avgTotalGoals != null) beats.push(`Esos duelos promedian ${Number(h2h.avgTotalGoals).toFixed(2).replace('.', ',')} goles por partido.`);
  }
  if (!beats.length) beats.push('Sin serie registrada: la muestra aún es corta y se declara.');
  return beats;
}

/** Métricas distintas rotando desde i (hasta 4 para el texto corrido). */
function distinctMetrics(metrics, i, count = 4) {
  const out = [];
  for (let k = 0; k < metrics.length && out.length < count; k += 1) {
    const m = metrics[(i + k) % metrics.length];
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

export function countWords(text) {
  return String(text ?? '').split(/\s+/).filter(Boolean).length;
}

/** Narración corrida lista para leer: hook + datos + cierre + CTA hablada. */
export function buildNarration(match, metrics, i) {
  const hook = HOOKS[i % HOOKS.length](match);
  const data = distinctMetrics(metrics, i);
  const parts = [hook];
  if (data[0]) parts.push(data[0]);
  if (data[1]) parts.push(`${CONNECTORS[i % CONNECTORS.length]} ${data[1]}`);
  if (data[2]) parts.push(`${CONNECTORS[(i + 3) % CONNECTORS.length]} ${data[2]}`);
  if (data[3]) parts.push(`${CONNECTORS[(i + 6) % CONNECTORS.length]} ${data[3]}`);
  parts.push(CLOSERS[i % CLOSERS.length]);
  parts.push(SPOKEN_CTAS[i % SPOKEN_CTAS.length]);
  const narration = parts.join(' ');
  return { hook, narration, words: countWords(narration) };
}

/** Selección de la corrida: todos los NS de la ventana (fixtures.json ya es 7 días). */
export function selectMatches(matches, { onlyMatch = null, limit = null } = {}) {
  let out = (matches ?? []).filter(m => m.status === 'NS');
  if (onlyMatch) out = out.filter(m => m.id === onlyMatch || m.webId === onlyMatch);
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
export function scriptFacts(match, scorers = null) {
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
        home: esName(recent.home),
        away: esName(recent.away),
        homeScore: recent.homeScore,
        awayScore: recent.awayScore,
      } : null,
    };
  }
  return { home, away, homeForm, awayForm, h2h, players: importantPlayers(match, scorers) };
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
    .replace(/\s+/g, ' ')
    .trim();
}

export function competitionTag(competition) {
  return `#${String(competition ?? 'futbol').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

export function buildDescription({ lede, matchId, competition }) {
  return [
    cleanLede(lede),
    `🔗 Más data: https://goatlab.win/partido/${matchId}`,
    `#goatlab #futbol ${competitionTag(competition)}`,
    DISCLAIMER,
  ].join('\n');
}

/**
 * Rechaza un borrador del modelo si no se puede leer en voz alta,
 * inventa cifras o rompe el gate. Devuelve la lista de fallos.
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
    if (!PLAYER_SCRIPT_INDEXES.has(i)) {
      for (const n of numbersInText(`${hook} ${narration}`)) {
        if (!numberAllowed(n, allowed)) errors.push(`${label}: cifra ${n} no está en los hechos`);
      }
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
export function buildYoutubeScripts(match) {
  const webId = match.webId ?? match.id;
  const metrics = metricBeats(match);
  const names = { ...match, home: esName(match.home), away: esName(match.away) };
  const scripts = Array.from({ length: HOOKS.length }, (_, i) => {
    const { hook, narration, words } = buildNarration(names, metrics, i);
    return { n: i + 1, hook, narration, words };
  });
  const tag = `#${String(match.competition ?? 'futbol').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const description = [
    `${names.home} contra ${names.away}: forma, goles y cara a cara en menos de un minuto.`,
    metrics[0] ?? '',
    `🔗 Más data: https://goatlab.win/partido/${webId}`,
    `#goatlab #futbol ${tag}`,
    DISCLAIMER,
  ].join('\n');
  return { matchId: webId, providerId: match.id, scripts, description };
}
