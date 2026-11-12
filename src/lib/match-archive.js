import { FINISHED_STATUSES, hasNumericScore } from './football.js';
import { bakedForm, teamForm } from './form.js';
import { formSnapshot } from './match-seo.js';
import { resolvePruneMatch } from './pruning.js';
import { normalizeReading } from './reading.js';
import { matchDay, resolveCanonical, sameClub } from './teams.js';

const final = match => FINISHED_STATUSES.has(match?.status) && hasNumericScore(match);

export function archiveEntries(archive) {
  return Object.values(archive).sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff) || a.webId.localeCompare(b.webId));
}

function priorInput(entry) {
  if (typeof entry?.inputKey !== 'string' || !entry.inputKey.startsWith('v3|')) return null;
  const [identity, ...facts] = entry.inputKey.slice(3).split('\n');
  const [kind, id, home, away, competition, kickoff, status] = identity.split('|');
  if (kind !== 'M' || status !== 'NS' || !facts.some(line => /^(?:R|HR|P|B|T|S)\|/.test(line))) return null;
  return { id, home, away, competition, kickoff };
}

function sameMatch(match, input) {
  return match.competition === input.competition && matchDay(match.kickoff) === matchDay(input.kickoff)
    && sameClub(match.home, input.home) && sameClub(match.away, input.away);
}

function previousResult(input, byId, teams) {
  if (!Number.isFinite(Date.parse(input.kickoff))) return null;
  const result = byId.get(input.id);
  if (!hasNumericScore(result) || ![input.kickoff.slice(0, 10), matchDay(input.kickoff)].includes(result.date)
    || !sameMatch({ ...result, kickoff: input.kickoff }, input)) return null;
  const home = resolveCanonical(teams, result.home, { competition: result.competition })?.web;
  const away = resolveCanonical(teams, result.away, { competition: result.competition })?.web;
  if (!home || !away) return null;
  return { ...result, kickoff: input.kickoff, webId: `${home}-vs-${away}-${matchDay(input.kickoff)}`, status: 'FT' };
}

/** Save public editorial records independently of the temporary pipeline data. */
export function updateMatchArchive(previous, analyses, context, { results = [], teams = {}, activeMatches = [], now = Date.now() } = {}) {
  const archive = { ...previous };
  const byId = new Map(results.map(row => [row.id, row]));
  const active = new Set(activeMatches.flatMap(match => [match.id, match.webId]));
  for (const [slug, saved] of Object.entries(archive)) {
    const match = resolvePruneMatch(slug, context);
    if (!match || match.webId !== slug) continue;
    if (!final(match)) {
      if (active.has(slug) || active.has(match.id)) delete archive[slug];
      continue;
    }
    archive[slug] = { ...saved, status: match.status, homeScore: match.homeScore, awayScore: match.awayScore };
  }
  for (const [id, entry] of Object.entries(analyses ?? {})) {
    const input = priorInput(entry);
    if (!input || entry.review?.flag !== false) continue;
    const observed = resolvePruneMatch(id, context) ?? resolvePruneMatch(input.id, context);
    const match = final(observed) || active.has(id) || active.has(input.id) || (observed && active.has(observed.webId))
      ? observed : previousResult(input, byId, teams);
    if (!match?.webId || !final(match) || !sameMatch(match, input)) continue;
    const kickoff = Date.parse(match.kickoff), generated = Date.parse(entry.generatedAt);
    if (!(generated < kickoff && kickoff <= now) || generated <= Date.parse(archive[match.webId]?.reading.generatedAt)) continue;
    const reading = normalizeReading(entry);
    if (!reading) continue;
    const earlier = results.filter(row => row.date < match.kickoff.slice(0, 10));
    const form = name => {
      const rows = match.lastMatches?.[name]?.filter(row => row.date < match.kickoff.slice(0, 10));
      return bakedForm(rows, match[name]) ?? teamForm(earlier, match[name]);
    };
    const { home, away, competition, status, homeScore, awayScore, webId } = match;
    archive[webId] = {
      id: match.id, webId, home, away, competition, kickoff: match.kickoff, status, homeScore, awayScore,
      form: formSnapshot(form('home'), form('away')),
      reading: { summary: reading.sections, generatedAt: entry.generatedAt, limitations: entry.limitations ?? [] },
    };
  }
  return archive;
}
