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
export function priorityIndex(name) {
  const key = normalize(name);
  const index = PRIORITY_TEAMS.findIndex(team => normalize(team) === key);
  return index === -1 ? PRIORITY_TEAMS.length : index;
}
/** The featured match: highest priority (best-ranked team involved), then earliest kickoff. Finished matches excluded. */
export function heroMatch(matches) {
  const candidates = (matches ?? []).filter(match => !FINISHED.has(match.status));
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const priority = Math.min(priorityIndex(a.home), priorityIndex(a.away)) - Math.min(priorityIndex(b.home), priorityIndex(b.away));
    if (priority !== 0) return priority;
    return a.kickoff < b.kickoff ? -1 : a.kickoff > b.kickoff ? 1 : 0;
  })[0];
}
