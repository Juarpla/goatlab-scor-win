/**
 * Provider-intelligence fallback when the LLM did not deliver a reading: reformulates
 * the providers' declared readings in neutral Spanish (Bzzoiro
 * probabilities + `recommendations` as reserve, API-Football `advice`). No betting jargon, no
 * odds, always attributed to the provider. Deterministic and testable
 * templates; unrecognizable input is omitted, never printed raw.
 */
import { esName } from './teams.js';

const FAVORITE_SIDE = {
  home: 'home', h: 'home', local: 'home',
  away: 'away', a: 'away', visita: 'away', visitante: 'away',
  draw: 'draw', d: 'draw', x: 'draw', empate: 'draw',
};

/** Provider `favorite` → team name (or 'el empate'); null if unresolved. */
export function favoriteName(favorite, home, away) {
  const key = String(favorite ?? '').trim().toLowerCase();
  if (!key) return null;
  if (home && key === String(home).toLowerCase()) return home;
  if (away && key === String(away).toLowerCase()) return away;
  if (FAVORITE_SIDE[key] === 'home') return home || null;
  if (FAVORITE_SIDE[key] === 'away') return away || null;
  if (FAVORITE_SIDE[key] === 'draw') return 'el empate';
  return null;
}

const pct = value => (value == null ? null : `${Math.round(value * 100)}%`);

/** Provider 0-1 probability → 0-100 integer; null when missing. */
const pct100 = value =>
  (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? Math.round(value * 100)
    : null);

const pluralGoals = n => (n === 1 ? 'gol' : 'goles');

/** Goals line `+1.5`/`-3.5` → neutral Spanish. Null when unrecognizable. */
export function neutralGoals(token) {
  const match = String(token ?? '').trim().match(/^([+-]?)([\d.]+)$/);
  if (!match) return null;
  const n = Number(match[2]);
  if (!Number.isFinite(n)) return null;
  if (match[1] === '-') {
    const under = Math.ceil(n);
    return `menos de ${under} ${pluralGoals(under)}`;
  }
  const over = Math.floor(n) + 1;
  return `${over} o más ${pluralGoals(over)}`;
}

const cap = text => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** Left half of the advice (`X or draw`, `Winner: X`) → neutral, descriptive Spanish. */
function neutralHead(fragment) {
  const text = String(fragment ?? '').trim().replace(/^combo\s+/i, '');
  if (!text) return null;
  const direct = text.match(/^(double chance|doble oportunidad)\s*:\s*(.+)$/i);
  const body = direct ? direct[2].trim() : text;
  const sides = body.match(/^(.+?)\s+or\s+(.+)$/i);
  if (sides) {
    const left = sides[1].trim(), right = sides[2].trim();
    if (/^draws?$/i.test(left)) return `${cap(esName(right))} sin perder`;
    if (/^draws?$/i.test(right)) return `${cap(esName(left))} sin perder`;
    return `${cap(esName(left))} o ${cap(esName(right))}`;
  }
  const winner = text.match(/^winner\s*:\s*(.+)$/i);
  if (winner) return `gana ${esName(winner[1].trim())}`;
  return null;
}

/**
 * Raw API-Football advice → neutral, descriptive Spanish.
 * Ex: `Combo Double chance : draw or Aston Villa and -3.5 goals` (provider raw, never visible) →
 * `Aston Villa sin perder y menos de 4 goles`.
 */
export function adviceToNeutral(advice) {
  if (typeof advice !== 'string' || !advice.trim()) return null;
  const text = advice.trim();
  const combo = text.match(/^(.*?)\s+and\s+([+-]?[\d.]+)\s*goals?$/i);
  if (combo) {
    const head = neutralHead(combo[1]);
    const tail = neutralGoals(combo[2]);
    if (head && tail) return `${head} y ${tail}`;
    return head ?? tail ?? null;
  }
  return neutralHead(text);
}

/**
 * Builds the fallback lines. Returns `{ bz, af }` or null when
 * no provider contributes anything usable.
 */
export function buildProviderAdvice({ provider = null, afPrediction = null, home = '', away = '' } = {}) {
  const bz = [];
  const rec = provider?.recommendations ?? null;
  if (rec) {
    const fav = favoriteName(rec.favorite, home, away);
    if (fav) {
      const prob = pct(rec.favoriteProb);
      bz.push({ label: 'Mayor probabilidad estimada', text: prob ? `${esName(fav)} (${prob}, según el modelo)` : `${esName(fav)}, según el modelo` });
    }
  }
  // Probabilities lead over the boolean: a blunt `No` contradicted
  // the scoreline (e.g. BTTS `false` + `1-1`); the `%` qualifies it and keeps coherence.
  const over25p = pct100(provider?.over25);
  if (over25p != null) {
    bz.push({ label: 'Goles en total', text: `${over25p}% que haya 3 o más goles, según el modelo` });
  } else if (typeof rec?.over25 === 'boolean') {
    bz.push({ label: 'Goles en total', text: rec.over25 ? 'El modelo espera 3 o más goles' : 'El modelo espera menos de 3 goles' });
  }
  const bttsP = pct100(provider?.btts);
  if (bttsP != null) {
    bz.push({ label: 'Marcan los dos', text: `${bttsP}% que sí, según el modelo` });
  } else if (typeof rec?.btts === 'boolean') {
    bz.push({ label: 'Marcan los dos', text: rec.btts ? 'Sí, según el modelo' : 'No, según el modelo' });
  }
  const af = [];
  const neutral = adviceToNeutral(afPrediction?.advice);
  if (neutral) af.push({ label: 'Lectura del proveedor', text: neutral });
  else if (afPrediction?.winner) af.push({ label: 'Lectura del proveedor', text: `Mayor probabilidad estimada: ${esName(afPrediction.winner)}, según el modelo` });
  if (!bz.length && !af.length) return null;
  return { bz, af };
}
