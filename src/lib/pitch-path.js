/**
 * Recorrido ilustrativo del balón para la cancha de la página de partido.
 *
 * Las anclas son los eventos reales (minuto + tipo + equipo); la deriva entre
 * anclas es una simulación determinista sembrada con el id del partido, para
 * que el servidor y el cliente dibujen exactamente lo mismo y el movimiento
 * se sienta continuo. No es un seguimiento de posición: la página lo declara.
 */
const MINUTE = 90;
const PAUSE = 5;

export function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round1 = value => Math.round(value * 10) / 10;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Posición de anclaje de un evento: los goles caen en el área que atacan. */
function anchorFor(event, rand) {
  const side = event.team === 'away' ? 'away' : 'home';
  if (event.type === 'goal') {
    return side === 'home'
      ? { x: round1(86 + rand() * 12), y: round1(20 + rand() * 28) }
      : { x: round1(7 + rand() * 12), y: round1(20 + rand() * 28) };
  }
  if (event.type === 'card') return { x: round1(40 + rand() * 25), y: round1(10 + rand() * 48) };
  if (event.type === 'sub') return { x: round1(44 + rand() * 16), y: rand() > 0.5 ? 3 : 65 };
  return { x: round1(30 + rand() * 45), y: round1(10 + rand() * 48) };
}

/**
 * Beats ordenados por minuto: apertura, derivas sembradas entre eventos,
 * anclas reales y cierre. Los minutos se relajan para que dos eventos
 * consecutivos no se pisen.
 */
export function buildBeats(matchId, events = []) {
  const rand = mulberry32(hashSeed(String(matchId)));
  const beats = [{ minute: 0, x: 52.5, y: 34, kind: 'kickoff' }];
  const ordered = [...events].filter(event => Number.isFinite(event.minute)).sort((a, b) => a.minute - b.minute);
  let last = 0;
  for (const event of ordered) {
    const minute = Math.max(last + 1, Math.min(MINUTE + PAUSE, event.minute));
    const gap = minute - last;
    if (gap > 8) {
      const count = Math.min(3, Math.floor(gap / 8));
      for (let i = 1; i <= count; i++) {
        beats.push({ minute: round1(last + (gap * i) / (count + 1)), x: round1(34 + rand() * 40), y: round1(12 + rand() * 44), kind: 'drift' });
      }
    }
    beats.push({ minute, ...anchorFor(event, rand), kind: event.type, event });
    last = minute;
  }
  if (last < MINUTE + PAUSE) beats.push({ minute: MINUTE + PAUSE, x: 52.5, y: 34, kind: 'final' });
  return beats;
}

/** Posición del balón (unidades de la cancha 105×68) en un minuto con decimales. */
export function ballAt(beats, minute) {
  if (!beats?.length) return { x: 52.5, y: 34 };
  const m = clamp(minute, 0, beats[beats.length - 1].minute);
  let index = 0;
  while (index < beats.length - 2 && beats[index + 1].minute < m) index += 1;
  const from = beats[index];
  const to = beats[index + 1] ?? from;
  const span = to.minute - from.minute;
  const t = span <= 0 ? 1 : clamp((m - from.minute) / span, 0, 1);
  const eased = t * t * (3 - 2 * t);
  return {
    x: clamp(from.x + (to.x - from.x) * eased + Math.sin(m * 0.7) * 1.6, 1.5, 103.5),
    y: clamp(from.y + (to.y - from.y) * eased + Math.cos(m * 0.9) * 1.8, 1.5, 66.5),
  };
}

/** Minuto de juego estimado desde el kickoff (misma convención que el mapa de portada). */
export function matchMinute(kickoffMs, nowMs) {
  const elapsed = (nowMs - kickoffMs) / 60_000;
  if (elapsed < 0) return null;
  if (elapsed <= 45) return elapsed;
  if (elapsed <= 60) return 45;
  if (elapsed <= 105) return Math.min(90, elapsed - 15);
  return MINUTE + PAUSE;
}
