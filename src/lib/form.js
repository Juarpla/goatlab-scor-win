import { sameClub } from './teams.js';

/** Real recent form, computed from the local results base (public/data/results.json). */
export function teamForm(results, team, count = 5) {
  const played = (results ?? [])
    .filter(row => row.homeScore != null && row.awayScore != null && (sameClub(row.home, team) || sameClub(row.away, team)))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, count);
  if (played.length < 3) return null;
  const goalsFor = [];
  const goalsAgainst = [];
  const form = [];
  const rivals = [];
  const dates = [];
  for (const row of played) {
    const isHome = sameClub(row.home, team);
    const scored = isHome ? row.homeScore : row.awayScore;
    const conceded = isHome ? row.awayScore : row.homeScore;
    goalsFor.push(scored);
    goalsAgainst.push(conceded);
    form.push(scored > conceded ? 'G' : scored === conceded ? 'E' : 'P');
    rivals.push(isHome ? row.away : row.home);
    dates.push(row.date);
  }
  return { played: played.length, goalsFor, goalsAgainst, form, rivals, dates };
}
/** Both sides' form for one fixture, or null when either team lacks enough data. */
export function matchForm(results, home, away) {
  const homeForm = teamForm(results, home);
  const awayForm = teamForm(results, away);
  return homeForm && awayForm ? { homeForm, awayForm } : null;
}
