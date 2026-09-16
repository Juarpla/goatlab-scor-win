/**
 * Datos en vivo de un partido (on-demand, sin prerender).
 *
 * Proxy server-side a API-Football: la key nunca llega al navegador y el
 * consumo de la API es independiente del tráfico — cada visitante pega al
 * caché del edge (s-maxage 60s); el caché consulta al proveedor ~1 vez por
 * minuto por partido en vivo, dentro de los 10 req/min del plan gratuito.
 * Si no hay key o el proveedor falla, responde ok:false y la página degrada
 * a los datos horneados sin romper nada.
 */
export const prerender = false;

// Runtime de Workers (adapter v14): la key vive en el entorno del worker,
// nunca llega al navegador.
import { env as workerEnv } from 'cloudflare:workers';

const TIMEOUT = 8_000;
/** s-maxage del estado vivo: 60s, la cadencia del proveedor. */
const LIVE_TTL = 60;
/** Fallos del proveedor se cachean poco para recuperarse rápido. */
const FAIL_TTL = 30;

async function apiFootball(path, env) {
  const res = await fetch(`https://v3.football.api-sports.io/${path}`, {
    headers: { 'x-apisports-key': env.API_FOOTBALL_KEY },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length) throw new Error('El proveedor no pudo entregar datos');
  return data.response;
}

const EVENT_TYPES = { Goal: 'goal', Card: 'card', subst: 'sub' };
/** Vocabulario del detalle de API-Football → nota en español; null = omitir nota. */
const EVENT_DETAIL = { 'Normal Goal': null, 'Own Goal': 'Gol en propia puerta', Penalty: 'De penal', 'Missed Penalty': 'Penal fallado', 'Yellow Card': 'Tarjeta amarilla', 'Red Card': 'Tarjeta roja', 'Second Yellow card': 'Segunda amarilla' };

function mapEvent(item, teams) {
  const type = EVENT_TYPES[item.type];
  if (!type) return null;
  const minute = item.time?.elapsed ?? null;
  const extra = item.time?.extra ?? null;
  const notes = [
    EVENT_DETAIL[item.detail] ?? (type === 'goal' ? (item.detail === 'Normal Goal' ? null : item.detail) : null),
    extra > 0 ? `${minute}+${extra}′` : null,
  ].filter(Boolean);
  return {
    minute,
    type,
    team: teams.home != null && item.team?.id === teams.home ? 'home' : teams.away != null && item.team?.id === teams.away ? 'away' : null,
    player: item.player?.name ?? null,
    playerOut: type === 'sub' ? item.assist?.name ?? null : null,
    detail: notes.join(' · ') || null,
    score: item.score?.home != null && item.score?.away != null ? { home: item.score.home, away: item.score.away } : null,
  };
}

export async function GET({ params, request, locals }) {
  const id = String(params.id ?? '');
  const providerId = id.startsWith('af-') ? Number(id.slice(3)) : NaN;
  if (!Number.isInteger(providerId)) {
    return Response.json({ ok: false, reason: 'solo-partidos-api-football' }, { status: 404 });
  }
  const env = workerEnv ?? {};
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(request.url, request);
  try {
    const cached = cache ? await cache.match(cacheKey) : null;
    if (cached) return cached;
  } catch { /* sin caché disponible en este runtime */ }

  const headers = ttl => ({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`,
  });

  if (!env.API_FOOTBALL_KEY) return Response.json({ ok: false, reason: 'sin credenciales' }, { headers: headers(30) });

  try {
    const [fixture] = await apiFootball(`fixtures?id=${providerId}`, env);
    if (!fixture) {
      return Response.json({ ok: false, reason: 'partido no encontrado' }, { headers: headers(120) });
    }
    let events = [];
    try {
      const raw = await apiFootball(`fixtures/events?fixture=${providerId}`, env);
      events = raw.map(item => mapEvent(item, { home: fixture.teams?.home?.id, away: fixture.teams?.away?.id })).filter(Boolean);
    } catch { /* el estado sigue siendo útil sin la lista de eventos */ }
    const body = {
      ok: true,
      id,
      status: fixture.fixture?.status?.short ?? null,
      minute: fixture.fixture?.status?.elapsed ?? null,
      homeScore: fixture.goals?.home ?? null,
      awayScore: fixture.goals?.away ?? null,
      events,
      updatedAt: new Date().toISOString(),
    };
    const res = Response.json(body, { headers: headers(LIVE_TTL) });
    if (cache && locals?.cfContext?.waitUntil) locals.cfContext.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (error) {
    return Response.json({ ok: false, reason: error.message }, { headers: headers(30) });
  }
}
