/**
 * Guiones de Shorts: 10 variantes deterministas por partido (<50s cada una).
 * Texto corrido listo para leer en voz alta: hook + datos entrelazados +
 * cierre + CTA hablada. Cero tokens LLM: plantillas + métricas reales del
 * JSON. Sin porcentajes mientras el gate de publicación siga cerrado
 * (ver COMPLIANCE.md).
 */
import { DISCLAIMER } from './compliance.js';
import { sameClub } from './teams.js';

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
  let wins = 0, draws = 0, gf = 0, clean = 0;
  for (const r of played) {
    const mine = sameClub(r.home, team) ? r.homeScore : r.awayScore;
    const theirs = sameClub(r.home, team) ? r.awayScore : r.homeScore;
    gf += mine;
    if (mine > theirs) wins += 1;
    else if (mine === theirs) draws += 1;
    if (theirs === 0) clean += 1;
  }
  return { n: played.length, wins, draws, losses: played.length - wins - draws, gf, clean };
}

const HOOKS = [
  (m) => `${m.home} contra ${m.away}: los números cuentan otra historia.`,
  (m) => `Nadie mira este ${m.home} contra ${m.away}, y debería.`,
  (m) => `El ${m.home} contra ${m.away} engaña: mira la forma.`,
  (m) => `¿Pocos goles en el ${m.home} contra ${m.away}? Los datos responden.`,
  (m) => `El historial del ${m.home} contra ${m.away} pesa más de lo que crees.`,
  (m) => `Tres datos antes del ${m.home} contra ${m.away}.`,
  (m) => `El ${m.away} visita al ${m.home} con la historia en contra.`,
  (m) => `Arco en cero: la clave del ${m.home} contra ${m.away}.`,
  (m) => `Lo que ya jugaron dice mucho de este ${m.home} contra ${m.away}.`,
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
  const home = formLine(match.lastMatches?.home, match.home);
  const away = formLine(match.lastMatches?.away, match.away);
  if (home) beats.push(`El ${match.home} ganó ${home.wins} de sus últimos ${home.n}, con ${home.gf} goles a favor.`);
  if (away) beats.push(`El ${match.away} ganó ${away.wins} de sus últimos ${away.n}, con ${away.gf} goles a favor.`);
  if (home?.clean || away?.clean) {
    const clean = Math.max(home?.clean ?? 0, away?.clean ?? 0);
    const side = (home?.clean ?? 0) >= (away?.clean ?? 0) ? match.home : match.away;
    beats.push(`El arco en cero apareció ${clean} ${pl(clean, 'vez', 'veces')}: ${side} defiende bien.`);
  }
  const h2h = match.h2h;
  if (h2h?.totalMatches) {
    beats.push(`El cara a cara suma ${h2h.totalMatches} duelos: ${h2h.homeWins} ${pl(h2h.homeWins, 'local', 'locales')}, ${h2h.draws} ${pl(h2h.draws, 'empate', 'empates')}.`);
    if (h2h.avgTotalGoals != null) beats.push(`Esos duelos promedian ${String(h2h.avgTotalGoals).replace('.', ',')} goles por partido.`);
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

/** Diez guiones + descripción lista para YouTube. */
export function buildYoutubeScripts(match) {
  const webId = match.webId ?? match.id;
  const metrics = metricBeats(match);
  const scripts = Array.from({ length: HOOKS.length }, (_, i) => {
    const { hook, narration, words } = buildNarration(match, metrics, i);
    return { n: i + 1, hook, narration, words };
  });
  const tag = `#${String(match.competition ?? 'futbol').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const description = [
    `${match.home} contra ${match.away}: forma, goles y cara a cara en menos de un minuto.`,
    metrics[0] ?? '',
    `🔗 Más data: https://goatlab.win/partido/${webId}`,
    `#goatlab #futbol ${tag}`,
    DISCLAIMER,
  ].join('\n');
  return { matchId: webId, providerId: match.id, scripts, description };
}
