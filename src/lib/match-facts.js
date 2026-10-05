import { scriptFacts } from './youtube.js';

/** Closed catalog: models refer to facts, never supply numeric chart values. */
export function editingFacts(match, scorers) {
  const facts = scriptFacts(match, scorers), result = [];
  const labels = { n: 'partidos', wins: 'victorias', draws: 'empates', losses: 'derrotas', gf: 'goles a favor', ga: 'goles recibidos', clean: 'arcos en cero' };
  const add = (id, label, value, unit, source) => {
    if (Number.isFinite(value) && value >= 0) result.push({ id, label, value, unit, source, provider: id.startsWith('h2h.') ? match.h2h?.source ?? 'Datos del encuentro' : source.startsWith('scorers:') ? 'Tabla de goleadores' : match.lastMatches?.source ?? 'Historial del encuentro', sampleSize: id.startsWith('h2h.') ? facts.h2h?.total ?? null : facts[`${id.split('.')[0]}Form`]?.n ?? null });
  };
  for (const side of ['home', 'away']) {
    for (const [key, label] of Object.entries(labels))
      add(`${side}.${key}`, `${facts[side]} · ${label}`, facts[`${side}Form`]?.[key], ['gf','ga'].includes(key) ? 'goles' : 'partidos', `fixtures:${match.webId ?? match.id}:lastMatches.${side}.${key}`);
    for (const [index, player] of (facts.players?.[side] ?? []).entries())
      add(`${side}.player${index}.goals`, `${player.name} · goles`, player.goals, 'goles', `scorers:${match.competition}:${player.name}`);
  }
  for (const [key, label] of Object.entries({ total: 'Cruces previos', homeWins: `${facts.home} · victorias en cruces`, awayWins: `${facts.away} · victorias en cruces`, draws: 'Empates en cruces' }))
    add(`h2h.${key}`, label, facts.h2h?.[key], 'partidos', `fixtures:${match.webId ?? match.id}:h2h.${key}`);
  return result;
}
