/**
 * Canonical team dictionary (one-off + manual refresh).
 *
 * Source per provider, current European season 2026 (=2026/27) and
 * Libertadores 2026:
 * - Bzzoiro: standings per league -> current real team_id (10 req of 7,500/day).
 * - Football-Data.org: /competitions/{PL|PD|CL}/teams?season=2026 (3-4 req,
 *   10/min; Europa has no `fd`, the CLI may not be on free -> honest null).
 * - API-Football: free blocks season>=2025, so the roster comes from
 *   /teams?league&season=2024 (5 req of 100/day, `bridged:true`) and observed
 *   2026 ids are harvested from /fixtures?date= (up to 3 req; responses
 *   include real teams.home/away.id; `bridged:false`).
 *
 * Bzzoiro 2026 owns the list (scope: active teams only). AF/FD ids are
 * matched by name: exact equality first, then tolerant matching
 * (sameClub/sameTeam) with disambiguation — a tolerant candidate whose
 * name is the exact name of ANOTHER Bzzoiro row in the league (e.g.
 * "Northern Ireland" versus "Ireland") does not bridge ids; without an
 * honest match the field stays null, never invented. Frozen slugs
 * (`frozen:true`) are kept between runs.
 *
 * Usage: node --env-file=.env scripts/build-teams.mjs
 */
import { writeFile, readFile } from 'node:fs/promises';
import { competitions } from '../src/lib/football.js';
import { leagueByProviderId, providerLeagueId } from '../src/lib/leagues.js';
import { fetchBzzoiroStandings, sameTeam } from '../src/lib/bzzoiro.js';
import { normalize, sameClub, teamDisplay } from '../src/lib/teams.js';

const AF_SEASON = 2024;
const FD_SEASON = 2026;
const BZ_SEASON = 2026;
const PACE_MS = 6_500;
let lastCall = 0;

async function paced(url, headers) {
  const wait = lastCall + PACE_MS - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastCall = Date.now();
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length) throw new Error('El proveedor no pudo entregar datos');
  return data;
}

export function slugify(name) {
  return normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'equipo';
}

export function matchIn(name, candidates, claimed = null) {
  const sameLeague = candidates.filter(c => c.league === name.league);
  const pools = name.league ? [sameLeague] : [candidates];
  for (const pool of pools) {
    const exact = pool.filter(c => normalize(c.name) === normalize(name.name));
    if (exact.length) return exact.length===1?exact[0]:null;
    // The tolerant bridge does not steal exact names from another league row.
    const hits = pool.filter(c => (sameClub(c.name, name.name) || sameTeam(c.name, name.name))
      && !(claimed?.has(`${name.league}|${normalize(c.name)}`) && normalize(c.name) !== normalize(name.name)));
    if (hits.length === 1) return hits[0];
  }
  return null;
}

async function main() {
  const env = process.env;
  const previous = JSON.parse(await readFile('public/data/teams.json', 'utf8').catch(() => JSON.stringify({ teams: {} })));
  const frozenBySlug = new Map(Object.entries(previous.teams ?? {}).filter(([, e]) => e?.frozen).map(([s, e]) => [s, e]));
  const frozenByName = new Map([...frozenBySlug].map(([s, e]) => [normalize(e.display ?? e.name ?? s), s]));

  // Bzzoiro leads: current standings per league. The catalog lives in leagues.json;
  // during migration the old teams.json map is accepted.
  const legacyLeagues = JSON.parse(await readFile('public/data/teams.json', 'utf8').catch(() => '{}')).leagues ?? null;
  const bzRows = [];
  for (const comp of competitions) {
    const leagueId = providerLeagueId(comp.id, 'bzzoiro') ?? legacyLeagues?.[comp.id]?.id;
    if (!leagueId || !env.BZZOIRO_API_TOKEN) continue;
    const table = await fetchBzzoiroStandings(leagueId, { env, top: 60 }).catch(error => {
      console.warn(`Bzzoiro ${comp.id}: ${error.message}`);
      return null;
    });
    for (const row of table?.rows ?? []) {
      if (row.team != null) bzRows.push({ league: comp.id, name: row.team, id: row.teamId ?? null });
    }
  }
  if (!bzRows.length) throw new Error('Sin filas Bzzoiro; revisa BZZOIRO_API_TOKEN');
  // Exact names per league according to Bzzoiro: the tolerant bridge cannot
  // claim another row's name (Ireland versus Northern Ireland).
  const claimed = new Set(bzRows.map(row => `${row.league}|${normalize(row.name)}`));

  // API-Football: 2024 roster + 2026 harvest via fixtures?date= (real team ids).
  const afRoster = [];
  const afHarvest = new Map();
  if (env.API_FOOTBALL_KEY) {
    for (const comp of competitions) {
      const apiLeagueId = providerLeagueId(comp.id, 'api');
      if (!apiLeagueId) continue;
      try {
        const data = await paced(
          `https://v3.football.api-sports.io/teams?league=${apiLeagueId}&season=${AF_SEASON}`,
          { 'x-apisports-key': env.API_FOOTBALL_KEY });
        for (const row of data.response ?? []) {
          if (row?.team?.name != null) {
            afRoster.push({ league: comp.id, name: row.team.name, id: row.team.id, code: row.team.code ?? null, season: AF_SEASON, bridged: true });
          }
        }
      } catch (error) { console.warn(`AF roster ${comp.id}: ${error.message}`); }
    }
    // The free plan only serves yesterday..tomorrow; days outside return `errors`.
    const today = new Date().toISOString().slice(0, 10);
    for (const offset of [-1, 0, 1]) {
      const day = new Date(`${today}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() + offset);
      const date = day.toISOString().slice(0, 10);
      try {
        const data = await paced(
          `https://v3.football.api-sports.io/fixtures?date=${encodeURIComponent(date)}`,
          { 'x-apisports-key': env.API_FOOTBALL_KEY });
        for (const item of data.response ?? []) {
          const comp = leagueByProviderId('api', item.league?.id);
          for (const side of ['home', 'away']) {
            const team = item.teams?.[side];
            if (team?.name && team?.id != null && !afHarvest.has(normalize(team.name))) {
              afHarvest.set(normalize(team.name), { league: comp?.id ?? null, name: team.name, id: team.id, season: 2026, bridged: false });
            }
          }
        }
      } catch (error) { console.warn(`AF cosecha ${date}: ${error.message}`); }
    }
  }

  // Football-Data.org: 2026 squads (Europa excluded: no `fd` on free).
  const fdRows = [];
  if (env.FOOTBALL_DATA_KEY) {
    for (const comp of competitions) {
      const fdLeagueId = providerLeagueId(comp.id, 'fd');
      if (!fdLeagueId) continue;
      try {
        const data = await paced(
          `https://api.football-data.org/v4/competitions/${fdLeagueId}/teams?season=${FD_SEASON}`,
          { 'X-Auth-Token': env.FOOTBALL_DATA_KEY });
        for (const team of data.teams ?? []) {
          if (team?.name != null) {
            fdRows.push({ league: comp.id, name: team.name, id: team.id, shortName: team.shortName ?? null, tla: team.tla ?? null });
          }
        }
      } catch (error) { console.warn(`FD ${comp.id}: ${error.message}`); }
    }
  }

  // Merge: one entry per active club (freezable slug key).
  const teams = {};
  const claim = (base, league) => {
    let slug = frozenByName.get(normalize(base)) ?? slugify(base);
    if (teams[slug] && normalize(teams[slug].display) !== normalize(base)) slug = `${slug}-${league}`;
    return slug;
  };
  for (const bz of bzRows) {
    const frozenSlug = frozenByName.get(normalize(bz.name));
    const slug = frozenSlug ?? claim(teamDisplay(bz.name) || bz.name, bz.league);
    const entry = teams[slug] ?? {
      ...(frozenBySlug.get(slug) ?? {}),
      name: teamDisplay(bz.name) || bz.name,
      display: (frozenBySlug.get(slug)?.display ?? teamDisplay(bz.name)) || bz.name,
      web: slug,
      leagues: [],
      id: null,
      bzzoiro: null,
      af: null,
      fd: null,
      aliases: [...(frozenBySlug.get(slug)?.aliases ?? [])],
      frozen: Boolean(frozenBySlug.get(slug)),
      source: 'build-teams',
    };
    if (!entry.leagues.includes(bz.league)) entry.leagues.push(bz.league);
    if (bz.id != null && entry.id == null) entry.id = bz.id;
    if (bz.id != null && entry.bzzoiro == null) entry.bzzoiro = { id: bz.id };
    const addAlias = value => {
      if (value && !entry.aliases.some(a => sameClub(a, value)) && !sameClub(entry.display, value)) entry.aliases.push(value);
    };

    // 2026 harvest only same league and exact equality first: the global pool
    // brings the whole world (e.g. "Barcelona SC") and tolerant matching would bite.
    const harvestPool = [...afHarvest.values()].filter(h => h.league === bz.league);
    const harvest = matchIn({ league: bz.league, name: bz.name }, harvestPool, claimed);
    const roster = harvest ?? matchIn({ league: bz.league, name: bz.name }, afRoster, claimed);
    if (roster && entry.af == null) {
      entry.af = { id: roster.id, season: roster.season, bridged: roster.bridged };
      addAlias(roster.name);
      if (roster.code) addAlias(roster.code);
    }
    const fd = matchIn({ league: bz.league, name: bz.name }, fdRows, claimed);
    if (fd && entry.fd == null) {
      entry.fd = { id: fd.id };
      addAlias(fd.name);
      if (fd.shortName) addAlias(fd.shortName);
      if (fd.tla) addAlias(fd.tla);
    }
    teams[slug] = entry;
  }

  const withAf = Object.values(teams).filter(t => t.af).length;
  const withFd = Object.values(teams).filter(t => t.fd).length;
  const withBz = Object.values(teams).filter(t => t.bzzoiro).length;
  await writeFile('public/data/teams.json', JSON.stringify({
    schemaVersion: 1, season: BZ_SEASON, updatedAt: new Date().toISOString(),
    coverage: { teams: Object.keys(teams).length, bzzoiro: withBz, af: withAf, fd: withFd },
    teams,
  }, null, 2));
  console.log(`teams.json: ${Object.keys(teams).length} equipos (bz:${withBz} af:${withAf} fd:${withFd}).`);
  for (const comp of competitions) {
    const rows = Object.values(teams).filter(t => t.leagues.includes(comp.id));
    console.log(` - ${comp.id}: ${rows.length} (sin af: ${rows.filter(t => !t.af).length}, sin fd: ${rows.filter(t => !t.fd).length})`);
  }
}

if (process.argv[1]?.endsWith('build-teams.mjs')) await main();
