/**
 * Fallback de la SabidurIA cuando el LLM no entregó lectura: reformula en
 * español neutro las lecturas declaradas de los proveedores (Bzzoiro
 * probabilidades + `recommendations` como reserva, `advice` de API-Football). Sin jerga de apuesta, sin
 * cuotas, siempre atribuido al proveedor. Plantillas deterministas y
 * testeables; lo irreconocible se omite, nunca se imprime en crudo.
 */
import { esName } from './teams.js';

const FAVORITE_SIDE = {
  home: 'home', h: 'home', local: 'home',
  away: 'away', a: 'away', visita: 'away', visitante: 'away',
  draw: 'draw', d: 'draw', x: 'draw', empate: 'draw',
};

/** `favorite` del proveedor → nombre del equipo (o 'el empate'); null si no se resuelve. */
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

/** Probabilidad 0–1 del proveedor → entero 0–100; null ante lo ausente. */
const pct100 = value =>
  (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? Math.round(value * 100)
    : null);

const pluralGoals = n => (n === 1 ? 'gol' : 'goles');

/** Línea de goles `+1.5`/`-3.5` → español neutro. Null ante lo irreconocible. */
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

/** Mitad izquierda del advice (`X or draw`, `Winner: X`) → español neutro y descriptivo. */
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
 * Advice crudo de API-Football → español neutro y descriptivo.
 * Ej: `Combo Double chance : draw or Aston Villa and -3.5 goals` (crudo del proveedor, nunca visible) →
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
 * Construye las líneas del fallback. Devuelve `{ bz, af }` o null cuando
 * ningún proveedor aporta nada usable.
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
  // Las probabilidades mandan sobre el booleano: el `No` tajante contradecía
  // el marcador (ej. BTTS `false` + `1-1`); el `%` matiza y mantiene coherencia.
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
