/**
 * Team helpers: hero priority for the front page and short labels for charts.
 * Priority order decided in planning: Barcelona, Real Madrid, PSG, the six
 * traditional English clubs, everyone else; ties broken by earliest kickoff.
 * Parón de selecciones: cuando no hay clubes prioritarios, manda el ranking
 * de selecciones (España, Inglaterra, Francia… primero) antes que el kickoff.
 */
const PRIORITY_TEAMS = ['Barcelona', 'Real Madrid', 'Paris Saint Germain', 'Arsenal', 'Liverpool', 'Manchester City', 'Manchester United', 'Chelsea', 'Tottenham'];
const NATIONS_PRIORITY = ['Spain', 'England', 'France', 'Portugal', 'Germany', 'Netherlands', 'Italy', 'Belgium', 'Croatia', 'Denmark', 'Norway', 'Türkiye', 'Switzerland', 'Austria', 'Serbia', 'Sweden', 'Poland', 'Wales', 'Scotland', 'Greece', 'Ukraine', 'Hungary', 'Czechia'];
const FINISHED = new Set(['FT', 'AET', 'PEN']);
const SHORTS = {
  barcelona: 'BAR', 'real madrid': 'RMA', 'paris saint germain': 'PSG', arsenal: 'ARS', liverpool: 'LIV',
  'manchester city': 'MCI', 'manchester united': 'MUN', chelsea: 'CHE', tottenham: 'TOT', newcastle: 'NEW',
  'aston villa': 'AVL', 'west ham': 'WHU', everton: 'EVE', 'real betis': 'BET', villarreal: 'VIL',
  'atletico madrid': 'ATM', 'athletic club': 'ATH', sevilla: 'SEV', 'real sociedad': 'RSO', valencia: 'VAL',
};
export function normalize(name) {
  return String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
/** Nombre en español para lectura en voz alta (los guiones son en español).
 *  Sin entrada → se devuelve el original (no rompe equipos futuros). */
const COUNTRY_ES = {
  Albania: 'Albania', Andorra: 'Andorra', Armenia: 'Armenia', Austria: 'Austria',
  Azerbaijan: 'Azerbaiyán', Belarus: 'Bielorrusia', Belgium: 'Bélgica',
  'Bosnia & Herzegovina': 'Bosnia y Herzegovina', Bulgaria: 'Bulgaria', Croatia: 'Croacia',
  Cyprus: 'Chipre', Czechia: 'Chequia', Denmark: 'Dinamarca', England: 'Inglaterra',
  Estonia: 'Estonia', 'Faroe Islands': 'Islas Feroe', Finland: 'Finlandia', France: 'Francia',
  Georgia: 'Georgia', Germany: 'Alemania', Gibraltar: 'Gibraltar', Greece: 'Grecia',
  Hungary: 'Hungría', Iceland: 'Islandia', Ireland: 'Irlanda', Israel: 'Israel',
  Italy: 'Italia', Kazakhstan: 'Kazajistán', Kosovo: 'Kosovo', Latvia: 'Letonia',
  Liechtenstein: 'Liechtenstein', Lithuania: 'Lituania', Luxembourg: 'Luxemburgo', Malta: 'Malta',
  Moldova: 'Moldavia', Montenegro: 'Montenegro', Netherlands: 'Países Bajos',
  'North Macedonia': 'Macedonia del Norte', 'Northern Ireland': 'Irlanda del Norte', Norway: 'Noruega',
  Poland: 'Polonia', Portugal: 'Portugal', 'Rep. Of Ireland': 'República de Irlanda',
  'Republic of Ireland': 'República de Irlanda', Romania: 'Rumanía', 'San Marino': 'San Marino',
  Scotland: 'Escocia', Serbia: 'Serbia', Slovakia: 'Eslovaquia', Slovenia: 'Eslovenia',
  Spain: 'España', Sweden: 'Suecia', Switzerland: 'Suiza', Türkiye: 'Turquía',
  Turkey: 'Turquía', Ukraine: 'Ucrania', Wales: 'Gales',
};
export function esName(name) {
  const key = String(name ?? '').trim();
  return COUNTRY_ES[key] ?? key;
}
/** Prefijos legales de proveedor que no distinguen club («FC Barcelona» = «Barcelona», «PAE AEK» = «AEK»). */
const CLUB_PREFIXES = new Set(['fc', 'cf', 'cd', 'ca', 'cr', 'rc', 'cs', 'afc', 'rcd', 'club', 'pae']);
/** Sufijos genéricos que sí pueden omitirse («Sevilla FC» = «Sevilla», «Levante UD» = «Levante»).
 *  «sc»/«ec» NO se omiten: distinguen (Barcelona ≠ Barcelona SC). */
const IGNORABLE_SUFFIXES = new Set(['fc', 'cf', 'afc', 'ud', 'cd']);
/** Clave canónica para dedup y comparación: sin prefijos legales ni sufijos genéricos. */
export function canonicalClubKey(name) {
  const aliases = {'racing club de lens':'lens','rc lens':'lens','sporting clube de portugal':'sporting cp'};
  const normalized = normalize(name);
  const tokens = (aliases[normalized] ?? normalized).split(' ').filter(Boolean);
  let start = 0;
  while (start < tokens.length && CLUB_PREFIXES.has(tokens[start])) start += 1;
  let end = tokens.length;
  while (end > start + 1 && IGNORABLE_SUFFIXES.has(tokens[end - 1])) end -= 1;
  return tokens.slice(start, end).join(' ');
}
/** Providers spell clubs differently ("Newcastle" vs "Newcastle United"); compare on the normalized key.
 *  El prefijo legal se ignora («FC Barcelona» = «Barcelona») y el resto vale
 *  por prefijo de cadena («Brighton» = «Brighton Hove Albion»), salvo marca
 *  de club que distingue: extra de un solo token «sc»/«ec» no iguala
 *  («Barcelona» != «Barcelona SC»). */
export function sameClub(a, b) {
  const left = canonicalClubKey(a);
  const right = canonicalClubKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const extraOf = (full, base) => {
    if (!full.startsWith(`${base} `)) return null;
    return full.slice(base.length + 1);
  };
  for (const [full, base] of [[left, right], [right, left]]) {
    const extra = extraOf(full, base);
    if (extra == null) continue;
    // Un solo «sc»/«ec» distingue clubes homónimos (Barcelona SC, Cruzeiro EC).
    if (extra === 'sc' || extra === 'ec') return false;
    return true;
  }
  return false;
}
/**
 * Diccionario canónico: clave slug estable → {display, leagues, web, id
 * (Bzzoiro, compat), bzzoiro/af/fd, aliases, frozen}.
 * Fuente: teams.json (scripts/build-teams.mjs). El pipeline resuelve por ID
 * antes que por nombre; el nombre queda como último recurso.
 */
export function resolveCanonical(catalog, name, {provider, providerId, competition} = {}) {
  const key = normalize(name);
  if (!key) return null;
  const teams = catalog?.teams ?? catalog ?? {};
  const entries = Object.entries(teams).filter(([,entry]) => !competition || entry.leagues?.includes(competition));
  const unique = candidates => candidates.length === 1 ? {key:candidates[0][0], ...candidates[0][1]} : null;
  if (provider && providerId != null) {
    const byId = entries.filter(([,entry]) => String(entry[provider]?.id ?? entry[provider]) === String(providerId));
    if (byId.length) return unique(byId);
  }
  const exact = entries.filter(([slug,entry]) => normalize(slug)===key || [entry.name,entry.display,...(entry.aliases??[])].some(value => normalize(value)===key));
  if (exact.length) return unique(exact);
  return unique(entries.filter(([,entry]) => [entry.name,...(entry.aliases??[])].some(value => sameClub(value,name))));
}
export function providerTeamId(catalog, name, provider) {
  const hit = resolveCanonical(catalog, name);
  if (!hit) return null;
  if (provider === 'bzzoiro') return hit.id ?? hit.bzzoiro?.id ?? hit.bzzoiro ?? null;
  if (provider === 'af') return hit.af?.id ?? (typeof hit.af === 'number' ? hit.af : null);
  if (provider === 'fd') return hit.fd?.id ?? (typeof hit.fd === 'number' ? hit.fd : null);
  return hit.id ?? null;
}
/** Slug web estable de un equipo (`real-madrid`); null si no está en el diccionario. */
export function webSlug(catalog, name) {
  const hit = resolveCanonical(catalog, name);
  return hit?.web ?? hit?.key ?? null;
}
/** Día civil del kickoff en Lima. A las 19:00 el instante UTC ya es el día siguiente. */
export function matchDay(kickoff) {
  const at = Date.parse(kickoff);
  if (!Number.isFinite(at)) return String(kickoff ?? '').slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
}
/** ID web de un encuentro: home-vs-away-fecha de Lima (`real-madrid-vs-barcelona-2026-10-26`). */
export function webMatchId(catalog, home, away, kickoff) {
  const homeSlug = webSlug(catalog, home) ?? slugify(home);
  const awaySlug = webSlug(catalog, away) ?? slugify(away);
  return `${homeSlug}-vs-${awaySlug}-${matchDay(kickoff)}`;
}
export function slugify(name) {
  return normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'equipo';
}
/** Nombre visible en español: limpia prefijos/sufijos y traduce selecciones (`Spain` → `España`). Clubes intactos. */
export function teamEsDisplay(name) {
  return esName(teamDisplay(name));
}
export function teamShort(name) {
  const key = normalize(teamEsDisplay(name));
  if (SHORTS[key]) return SHORTS[key];
  const letters = key.replace(/ /g, '').slice(0, 3).toUpperCase();
  return letters || '???';
}
/**
 * Etiqueta compacta para las camisetas: última palabra del nombre visible
 * con la inicial de la anterior («Real Madrid» → «R. Madrid»,
 * «Rayo Vallecano» → «R. Vallecano»; una sola palabra queda intacta).
 * Salta conectores («de», «la», «del»…) al buscar la inicial.
 */
const SKIP = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'al', 'en', 'a', 'the', 'of', 'da', 'do', 'das', 'dos', 'di', 'du', 'von', 'van']);
export function teamCompact(name) {
  const words = teamEsDisplay(name).split(/\s+/).filter(Boolean);
  if (!words.length) return '???';
  if (words.length === 1) return words[0];
  const last = words[words.length - 1];
  const prev = [...words.slice(0, -1)].reverse().find(w => !SKIP.has(normalize(w))) ?? words[words.length - 2];
  return `${prev.charAt(0).toUpperCase()}. ${last}`;
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
/** Ranking de selecciones para el hero en parón internacional. No rankeadas = al fondo. */
export function nationsPriorityIndex(name) {
  let key = normalize(name);
  if (key === 'turkey') key = 'turkiye';
  if (key === 'czech republic') key = 'czechia';
  const index = NATIONS_PRIORITY.findIndex(team => normalize(team) === key);
  return index === -1 ? NATIONS_PRIORITY.length : index;
}
/**
 * Partidos no terminados, del más relevante al menos.
 * La lista de clubes manda primero (×100); si no hay ningún club
 * prioritario, manda el ranking de selecciones (×100) en vez del kickoff.
 * En ambos casos: ambos equipos rankeados (+10) y proximidad del kickoff
 * (el más temprano gana el desempate, con paso pequeño para no pisar bonus).
 * Determinista: no usa el reloj.
 */
export function rankMatches(matches) {
  const candidates = (matches ?? []).filter(match => !FINISHED.has(match.status));
  if (!candidates.length) return [];
  const hasClub = candidates.some(match => priorityIndex(match.home) < PRIORITY_TEAMS.length || priorityIndex(match.away) < PRIORITY_TEAMS.length);
  const score = match => {
    if (hasClub) {
      const home = priorityIndex(match.home);
      const away = priorityIndex(match.away);
      const base = (PRIORITY_TEAMS.length - Math.min(home, away)) * 100;
      const bothPriority = home < PRIORITY_TEAMS.length && away < PRIORITY_TEAMS.length ? 10 : 0;
      const proximity = -Date.parse(match.kickoff) / 1e11;
      return base + bothPriority + proximity;
    }
    const home = nationsPriorityIndex(match.home);
    const away = nationsPriorityIndex(match.away);
    const base = (NATIONS_PRIORITY.length - Math.min(home, away)) * 100;
    const bothPriority = home < NATIONS_PRIORITY.length && away < NATIONS_PRIORITY.length ? 10 : 0;
    const proximity = -Date.parse(match.kickoff) / 1e11;
    return base + bothPriority + proximity;
  };
  return [...candidates].sort((a, b) => score(b) - score(a));
}

/** Partido destacado de la portada: el primero de rankMatches. */
export function heroMatch(matches) {
  return rankMatches(matches)[0] ?? null;
}

function listedIndex(name, list, exact) {
  if (exact < list.length) return exact;
  const fuzzy = list.findIndex(team => sameClub(name, team));
  return fuzzy === -1 ? list.length : fuzzy;
}

function shiftDay(day, amount) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
}

/**
 * Orden del top de guiones y media. Un club de la lista que juega hoy o
 * mañana, en hora de Lima, va primero aunque el fixture firme «FC» o «CF».
 * Si en esos dos días no hay ninguno, el cupo pasa a las selecciones. El
 * resto entra por saque inicial. Más allá de mañana, la lista no salta la cola.
 * Devuelve los partidos ya ordenados y cuántos ocupan ese cupo reservado.
 */
export function contentRanking(matches, now = Date.now()) {
  const upcoming = (matches ?? []).filter(match => match && !FINISHED.has(match.status));
  if (!upcoming.length) return { ranked: [], priorityCount: 0 };
  const today = matchDay(new Date(now).toISOString());
  const tomorrow = shiftDay(today, 1);
  const clubIndex = name => listedIndex(name, PRIORITY_TEAMS, priorityIndex(name));
  const nationIndex = name => listedIndex(name, NATIONS_PRIORITY, nationsPriorityIndex(name));
  const inWindow = match => {
    const day = matchDay(match.kickoff);
    return day === today || day === tomorrow;
  };
  const window = upcoming.filter(inWindow);
  const useClubs = window.some(match => clubIndex(match.home) < PRIORITY_TEAMS.length || clubIndex(match.away) < PRIORITY_TEAMS.length);
  const index = useClubs ? clubIndex : nationIndex;
  const list = useClubs ? PRIORITY_TEAMS : NATIONS_PRIORITY;
  const reserved = match => inWindow(match) && (index(match.home) < list.length || index(match.away) < list.length);
  const score = match => {
    const home = index(match.home);
    const away = index(match.away);
    const both = home < list.length && away < list.length ? 10 : 0;
    return (list.length - Math.min(home, away)) * 100 + both - Date.parse(match.kickoff) / 1e11;
  };
  const priority = upcoming.filter(reserved).sort((a, b) => score(b) - score(a));
  const rest = upcoming.filter(match => !reserved(match)).sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)));
  return { ranked: [...priority, ...rest], priorityCount: priority.length };
}
