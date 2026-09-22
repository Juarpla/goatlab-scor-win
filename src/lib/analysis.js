/**
 * Resolución de lecturas LLM (`llm-analysis.json`) por identidad, no solo por
 * id: los fixtures alternan entre ids `af-` y `fd-` cuando cambia el proveedor
 * primario, y una lectura generada bajo el id viejo queda huérfana. Aquí se
 * encuentra ese gemelo por equipos + fecha y se re-clava al id vigente.
 */
import { sameTeam } from './bzzoiro.js';
import { toCompactInput } from './compact.js';

const text = value => String(value ?? '').trim();

/**
 * Clave del input que sella cada lectura (v3: suma kind y stats para la
 * pizarra). Generar y comparar usan esta misma función: si coincide, el
 * pipeline salta el partido sin gastar llamadas.
 */
export function buildAnalysisKey(match, markets = null, ctx = {}) {
  return `v3|${toCompactInput(match, markets, ctx)}`;
}

/**
 * Parte la respuesta batch en valores por partido, sin validar el contenido
 * (eso lo hace validateAnalysis por ítem en el pipeline). Pura y testeable:
 * devuelve `{ entries: [{ matchId, value }], issues: [{ matchId, reason }] }`.
 */
export function parseBatchAnalyses(parsed, expectedIds) {
  const ids = [...(expectedIds ?? [])];
  const list = parsed && typeof parsed === 'object' && Array.isArray(parsed.analyses) ? parsed.analyses : null;
  if (!list) throw new Error('Batch sin arreglo analyses');
  const entries = [];
  const issues = [];
  const seen = new Set();
  for (const item of list) {
    const matchId = item?.matchId;
    if (typeof matchId !== 'string' || !ids.includes(matchId)) {
      issues.push({ matchId: typeof matchId === 'string' ? matchId : null, reason: 'matchId inesperado' });
      continue;
    }
    if (seen.has(matchId)) {
      issues.push({ matchId, reason: 'matchId duplicado' });
      continue;
    }
    seen.add(matchId);
    entries.push({ matchId, value: item });
  }
  for (const id of ids) {
    if (!seen.has(id)) issues.push({ matchId: id, reason: 'sin lectura en el batch' });
  }
  return { entries, issues };
}

/** Identidad de un partido del calendario. */
export function matchIdentity(match) {
  return {
    home: text(match?.home),
    away: text(match?.away),
    date: text(match?.kickoff).slice(0, 10),
  };
}

/** Identidad de una entrada guardada: campos estampados o `inputKey` (v2 o JSON legacy). */
export function entryIdentity(entry) {
  if (!entry) return null;
  if (entry.home || entry.away || entry.kickoff) {
    return { home: text(entry.home), away: text(entry.away), date: text(entry.kickoff).slice(0, 10) };
  }
  const key = entry.inputKey;
  if (typeof key !== 'string' || !key) return null;
  if (key.startsWith('v2|') || key.startsWith('v3|')) {
    const row = key.slice(3).split('\n')[0].split('|');
    if (row[0] !== 'M' || !text(row[2]) || !text(row[3])) return null;
    return { home: text(row[2]), away: text(row[3]), date: text(row[5]).slice(0, 10) };
  }
  if (key.startsWith('{')) {
    try {
      const parsed = JSON.parse(key);
      const home = text(parsed?.home);
      const away = text(parsed?.away);
      if (!home || !away) return null;
      return { home, away, date: text(parsed?.kickoff).slice(0, 10) };
    } catch { return null; }
  }
  return null;
}

/** Mismo cruce (±1 día por corrimientos de kickoff). Sin fecha en ambos lados, mandan los equipos. */
export function sameFixture(a, b, { dayTolerance = 1 } = {}) {
  if (!a || !b || !a.home || !a.away || !b.home || !b.away) return false;
  if (!sameTeam(a.home, b.home) || !sameTeam(a.away, b.away)) return false;
  if (!a.date || !b.date) return !a.date && !b.date;
  const gap = Math.abs(Date.parse(`${a.date}T00:00:00Z`) - Date.parse(`${b.date}T00:00:00Z`));
  return Number.isFinite(gap) && gap <= dayTolerance * 86_400_000;
}

/**
 * Busca la lectura de un partido: id directo primero; si no, gemelo por
 * identidad. Devuelve `{ key, entry, via }` o null.
 */
export function findAnalysis(analyses, match) {
  if (!analyses || !match) return null;
  if (analyses[match.id]) return { key: match.id, entry: analyses[match.id], via: 'id' };
  const target = matchIdentity(match);
  for (const [key, entry] of Object.entries(analyses)) {
    if (key === match.id) continue;
    if (sameFixture(entryIdentity(entry), target)) return { key, entry, via: 'identity' };
  }
  return null;
}

/**
 * Re-clava gemelos al id vigente y estampa identidad en la entrada. Puro:
 * devuelve un mapa nuevo. `inputKeyFor(match)` permite sellar la clave actual
 * para que el pipeline no regenere lo que acaba de adoptar.
 */
export function adoptAnalyses(analyses, matches, { inputKeyFor = null } = {}) {
  const next = { ...(analyses ?? {}) };
  const adopted = [];
  for (const match of matches ?? []) {
    if (!match?.id || next[match.id]) continue;
    const found = findAnalysis(next, match);
    if (!found || found.via === 'id') continue;
    const entry = {
      ...found.entry,
      home: match.home ?? found.entry.home ?? null,
      away: match.away ?? found.entry.away ?? null,
      kickoff: match.kickoff ?? found.entry.kickoff ?? null,
      webId: match.webId ?? found.entry.webId ?? null,
      rekeyedFrom: found.key,
    };
    if (typeof inputKeyFor === 'function') {
      const key = inputKeyFor(match, entry);
      if (key) entry.inputKey = key;
    }
    delete next[found.key];
    next[match.id] = entry;
    adopted.push({ from: found.key, to: match.id });
  }
  return { analyses: next, adopted };
}
