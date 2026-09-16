/**
 * Team helpers: hero priority for the front page and short labels for charts.
 * Priority order decided in planning: Barcelona, Real Madrid, PSG, the six
 * traditional English clubs, everyone else; ties broken by earliest kickoff.
 */
const PRIORITY_TEAMS = ['Barcelona', 'Real Madrid', 'Paris Saint Germain', 'Arsenal', 'Liverpool', 'Manchester City', 'Manchester United', 'Chelsea', 'Tottenham'];
const FINISHED = new Set(['FT', 'AET', 'PEN']);
const SHORTS = {
  barcelona: 'BAR', 'real madrid': 'RMA', 'paris saint germain': 'PSG', arsenal: 'ARS', liverpool: 'LIV',
  'manchester city': 'MCI', 'manchester united': 'MUN', chelsea: 'CHE', tottenham: 'TOT', newcastle: 'NEW',
  'aston villa': 'AVL', 'west ham': 'WHU', everton: 'EVE', 'real betis': 'BET', villarreal: 'VIL',
  'atlético madrid': 'ATM', 'athletic club': 'ATH', sevilla: 'SEV', 'real sociedad': 'RSO', valencia: 'VAL',
};
export function normalize(name) {
  return String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
/** Providers spell clubs differently ("Newcastle" vs "Newcastle United"); compare on the normalized key. */
export function sameClub(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}
export function teamShort(name) {
  const key = normalize(name);
  if (SHORTS[key]) return SHORTS[key];
  const letters = key.replace(/ /g, '').slice(0, 3).toUpperCase();
  return letters || '???';
}
/** Nombre limpio para leer: quita los prefijos/sufijos legales que firman los proveedores («FC Barcelona» → «Barcelona»). */
export function teamDisplay(name) {
  return String(name ?? '')
    .replace(/^(?:FC|CF|CD|CA|SC|CR|RC|CS|AFC|RCD|Club)\s+/i, '')
    .replace(/\s+(?:FC|CF|AFC|SC|EC|CD|Balompié)$/i, '');
}
export function priorityIndex(name) {
  const key = normalize(name);
  const index = PRIORITY_TEAMS.findIndex(team => normalize(team) === key);
  return index === -1 ? PRIORITY_TEAMS.length : index;
}
/**
 * The featured match, scored in layers (acordado en planificación):
 * la lista de prioridades manda como base (×100); encima van dos bonus —
 * ambos equipos prioritarios (+10) y proximidad del kickoff (el más
 * temprano gana el desempate, con paso pequeño para no pisar los bonus).
 * Los partidos terminados quedan fuera. Determinista: no usa el reloj.
 */
export function heroMatch(matches) {
  const candidates = (matches ?? []).filter(match => !FINISHED.has(match.status));
  if (!candidates.length) return null;
  const score = match => {
    const home = priorityIndex(match.home);
    const away = priorityIndex(match.away);
    const base = (PRIORITY_TEAMS.length - Math.min(home, away)) * 100;
    const bothPriority = home < PRIORITY_TEAMS.length && away < PRIORITY_TEAMS.length ? 10 : 0;
    const proximity = -Date.parse(match.kickoff) / 1e11;
    return base + bothPriority + proximity;
  };
  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}
