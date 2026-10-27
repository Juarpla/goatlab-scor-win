/** Public content contract shared by Actions, Astro and the portable GoatLab skill. */
import { esName } from './teams.js';
export const CONTENT_VERSION = 1;
export const CONTENT_PROVIDER_ORDER = 'OPENCODE_GO_MODEL,OPENCODE_GO_FALLBACK_MODEL,MISTRAL_MODEL,WORKERS_AI_MODEL';
export const CONTENT_CATEGORIES = Object.freeze({
  scripts: { label: 'Scripts', directory: 'youtube-scripts', count: 10 },
  'image-prompts': { label: 'Image Prompts', directory: 'image-prompts', count: 4, kinds: ['ball-duel', 'goal-action', 'supporters', 'stadium'] },
});
export function contentUrl(matchId, category, json = false) {
  if (!CONTENT_CATEGORIES[category]) throw new Error('Categoría desconocida');
  return `/partido/${encodeURIComponent(matchId)}/${category}${json ? '.json' : ''}`;
}

const identityId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
const nonempty = value => typeof value === 'string' && !!value.trim();
const kickoffTime = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN;

/** Structural identity only: names use the same translation as stored content. */
export function contentIdentityErrors(data, match = null) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['contenido vacío o inválido'];
  const errors = [];
  if (!identityId(data.matchId)) errors.push('matchId inválido');
  for (const field of ['home', 'away', 'competition']) if (!nonempty(data[field])) errors.push(`${field} inválido`);
  const kickoff = kickoffTime(data.kickoff);
  if (!Number.isFinite(kickoff)) errors.push('kickoff inválido');
  if (match != null) {
    const matchId = match?.webId ?? match?.id;
    if (!identityId(matchId) || data.matchId !== matchId) errors.push('matchId no coincide con fixture');
    for (const field of ['home', 'away']) {
      if (!nonempty(match?.[field]) || data[field] !== esName(match[field])) errors.push(`${field} no coincide con fixture`);
    }
    if (!nonempty(match?.competition) || data.competition !== match.competition) errors.push('competition no coincide con fixture');
    const expected = kickoffTime(match?.kickoff);
    if (!Number.isFinite(expected) || kickoff !== expected) errors.push('kickoff no coincide con fixture');
  }
  return errors;
}

/** Saved-script shape, independent of today's facts and narrative numeric claims. */
export function scriptStructureErrors(data, { matchId = null, match = null } = {}) {
  const errors = contentIdentityErrors(data, match);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return errors;
  if (matchId != null && data.matchId !== matchId) errors.push('matchId no coincide con archivo');
  if (!nonempty(data.description)) errors.push('description vacía o inválida');
  if (!Array.isArray(data.scripts) || data.scripts.length !== 10) errors.push('se requieren diez guiones');
  if (Array.isArray(data.scripts)) for (const [index, script] of data.scripts.entries()) {
    const label = `guion ${index + 1}`;
    if (script?.n !== index + 1) errors.push(`${label}: número incorrecto`);
    for (const field of ['title', 'hook', 'narration']) if (!nonempty(script?.[field])) errors.push(`${label}: ${field} vacío o inválido`);
    if (!Number.isInteger(script?.words) || script.words <= 0) errors.push(`${label}: words debe ser un entero positivo`);
    if (data.editorialVersion === 2 && (!nonempty(script?.projection) || !String(script?.narration ?? '').includes(script.projection))) errors.push(`${label}: proyección editorial ausente de la narración`);
    // El pick solo existe desde la mejora antecedente+pronóstico; los JSONs
    // viejos sin pick siguen válidos, pero un pick presente debe tener forma.
    if (script?.pick != null) {
      for (const field of ['bridge', 'noun', 'antecedent', 'verdict', 'call']) {
        if (!nonempty(script.pick[field])) errors.push(`${label}: pick.${field} vacío o inválido`);
      }
    }
  }
  return errors;
}
export function promptErrors(data, { category = data?.category, home = data?.home, away = data?.away, facts = data?.facts ?? [], published = false } = {}) {
  const spec = CONTENT_CATEGORIES[category] ?? (category === 'video-prompts' ? { count: 2, kinds: ['push-in', 'tracking'] } : null);
  if (!spec?.kinds) return ['Categoría de prompts desconocida'];
  if (!data || !Array.isArray(data.prompts) || data.prompts.length !== spec.count) return [`Se requieren ${spec.count} prompts`];
  const errors = [];
  const seen = new Set();
  for (const [i, row] of data.prompts.entries()) {
    const text = String(row?.prompt ?? '').trim();
    const label = `${category} ${i + 1}`;
    if (row?.n !== i + 1) errors.push(`${label}: número incorrecto`);
    if (row?.kind !== spec.kinds[i]) errors.push(`${label}: escena incorrecta`);
    if (typeof row?.title !== 'string' || !row.title.trim() || row.title.length > 160) errors.push(`${label}: título inválido`);
    if (text.length < 180 || text.length > 12000 || !/9\s*:\s*16/.test(text)) errors.push(`${label}: texto incompleto o formato ausente`);
    if (seen.has(text.toLowerCase())) errors.push(`${label}: prompt repetido`);
    seen.add(text.toLowerCase());
    if (category === 'image-prompts') {
      if (!home || !away || !text.includes(home) || !text.includes(away)) errors.push(`${label}: faltan ambos equipos`);
      if (!/photoreal|hyperreal/i.test(text) || !/referential|reference illustration/i.test(text) || !/illustration/i.test(text)) errors.push(`${label}: falta realismo y carácter referencial`);
      if (!/kit|uniform|shirt|jersey|colou?r/i.test(text)) errors.push(`${label}: falta identidad de los equipos`);
      if (row.kind === 'supporters' && !/supporters|fans|crowd/i.test(text)) errors.push(`${label}: falta hinchada`);
      if (row.kind === 'stadium' && (!/stadium/i.test(text) || !/flag/i.test(text) || !/crest|emblem|badge|logo/i.test(text))) errors.push(`${label}: falta presentación, banderas o escudos`);
    }
    if (category === 'video-prompts' && (!/6\s*(?:-| )?second/i.test(text) || !/image|picture/i.test(text) || !/camera/i.test(text))) errors.push(`${label}: faltan duración, imagen de referencia o cámara`);
  }
  return errors;
}
export function validateContent(data, category, matchId, { match = null } = {}) {
  if (category === 'scripts') return scriptStructureErrors(data, { matchId, match }).length === 0;
  if (!data || data.matchId !== matchId || !data.home || !data.away) return false;
  if (data.facts != null && (!Array.isArray(data.facts) || data.facts.length > 128 || data.facts.some(f => !f || typeof f.id !== 'string' || typeof f.label !== 'string' || !Number.isFinite(f.value) || f.value < 0 || typeof f.unit !== 'string' || typeof f.source !== 'string'))) return false;
  // Acepta v1 y v2: los bancos generados con CONTENT_VERSION 2 siguen vigentes.
  if (data.version !== CONTENT_VERSION && data.version !== CONTENT_VERSION + 1) return false;
  return data.category === category && promptErrors(data, { published: data.published === true }).length === 0;
}
