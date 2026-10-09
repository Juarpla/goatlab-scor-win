/** Public content contract shared by Actions, Astro and the portable GoatLab skill. */
import { esName } from './teams.js';
export const CONTENT_VERSION = 2;
export const CONTENT_PROVIDER_ORDER = 'OPENCODE_GO_FALLBACK_MODEL,OPENCODE_GO_MODEL,MISTRAL_MODEL,WORKERS_AI_MODEL';
export const CONTENT_CATEGORIES = Object.freeze({
  scripts: { label: 'Scripts', directory: 'youtube-scripts', count: 10 },
  'image-prompts': { label: 'Image Prompts', directory: 'image-prompts', count: 4, kinds: ['ball-duel', 'goal-action', 'supporters', 'stadium'] },
  'video-prompts': { label: 'Video Prompts', directory: 'video-prompts', count: 2, kinds: ['push-in', 'tracking'] },
  'motion-prompts': { label: 'Motion Prompts', directory: 'motion-prompts', count: 30, kinds: ['form', 'goals', 'clean-sheets', 'head-to-head', 'synthesis'] },
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
/** Motion v4: contrato ejecutable (beats, easing, background, spring). Estricto en version 2. */
export function motionContractErrors(row, label) {
  const errors = [];
  const beats = row?.beats;
  if (!Array.isArray(beats) || beats.length < 3 || beats.length > 4) { errors.push(`${label}: beats requiere 3-4 entradas`); return errors; }
  let cursor = 0;
  for (const [bi, beat] of beats.entries()) {
    if (!beat || typeof beat !== 'object') { errors.push(`${label}: beat ${bi + 1} inválido`); continue; }
    if (!['entry', 'build', 'main', 'exit'].includes(beat.action)) errors.push(`${label}: beat ${bi + 1} action inválida`);
    if (!Number.isFinite(beat.t0) || !Number.isFinite(beat.t1) || !(beat.t0 < beat.t1)) errors.push(`${label}: beat ${bi + 1} rango inválido`);
    if (bi > 0 && beat.t0 < cursor) errors.push(`${label}: beats solapados`);
    cursor = Number.isFinite(beat.t1) ? beat.t1 : cursor;
    if (typeof beat.detail !== 'string' || !beat.detail.trim()) errors.push(`${label}: beat ${bi + 1} sin detalle`);
  }
  const easing = row?.easing;
  if (!easing || easing.enter !== 'ease-out' || easing.exit !== 'ease-out' || typeof easing.curve !== 'string' || !/cubic-bezier/.test(easing.curve)) errors.push(`${label}: easing debe ser ease-out con cubic-bezier`);
  const bg = row?.background;
  if (!bg || !['carbon-grain', 'carbon-glow', 'carbon-grid'].includes(bg.variant) || bg.base !== '#101412') errors.push(`${label}: background variante inválida`);
  if (!bg || typeof bg.safeArea !== 'string' || !/left64/.test(bg.safeArea)) errors.push(`${label}: background sin safe-area`);
  const motion = row?.motion;
  if (!motion || !motion.spring || !Number.isFinite(motion.spring.damping) || !Number.isFinite(motion.spring.stiffness) || typeof motion.countUp !== 'boolean') errors.push(`${label}: motion spring/countUp inválidos`);
  if (!motion || !Number.isInteger(motion.staggerMs) || motion.staggerMs < 30 || motion.staggerMs > 80) errors.push(`${label}: staggerMs debe ser 30-80`);
  if (!motion || motion.scaleFrom !== 0.95) errors.push(`${label}: scaleFrom debe ser 0.95`);
  if (!row?.camera || typeof row.camera.move !== 'string' || !row.camera.move.trim()) errors.push(`${label}: camera.move requerido`);
  if (row?.camera && row.camera.tilt != null) {
    const tiltNums = [...String(row.camera.tilt).matchAll(/(\d+(?:\.\d+)?)\s*(?:deg|°)/g)].map(m => Number(m[1]));
    if (tiltNums.some(n => n > 2)) errors.push(`${label}: camera.tilt máximo 2deg (usa 0-2deg)`);
  }
  if (!row?.transition || typeof row.transition.in !== 'string' || typeof row.transition.out !== 'string') errors.push(`${label}: transition in/out requeridos`);
  if (!Array.isArray(row?.emphasis_words) || row.emphasis_words.length < 1 || row.emphasis_words.length > 3) errors.push(`${label}: emphasis_words 1-3 requeridas`);
  if (row.motionSystem !== 'carbon-v1') errors.push(`${label}: motionSystem debe ser carbon-v1`);
  if (typeof row.signature_move !== 'string' || !row.signature_move.trim()) errors.push(`${label}: signature_move requerido`);
  if (row?.revealMode != null && !['sequential', 'spotlight'].includes(row.revealMode)) errors.push(`${label}: revealMode inválido`);
  if (row?.signature_move != null && typeof row.signature_move !== 'string') errors.push(`${label}: signature_move inválido`);
  if (row?.design_rationale != null && (typeof row.design_rationale?.beat !== 'string' || typeof row.design_rationale?.tecnica !== 'string' || typeof row.design_rationale?.porque !== 'string')) errors.push(`${label}: design_rationale incompleto`);
  return errors;
}
export function promptErrors(data, { category = data?.category, home = data?.home, away = data?.away, facts = data?.facts ?? [], published = false } = {}) {
  const spec = CONTENT_CATEGORIES[category];
  if (!spec?.kinds) return ['Categoría de prompts desconocida'];
  // Motion v4: banco hasta 30 para no repetir entre los 10 clips.
  if (category === 'motion-prompts') {
    if (!data || !Array.isArray(data.prompts) || data.prompts.length < 2 || data.prompts.length > 30) return ['Se requieren entre 2 y 30 Motion Prompts'];
  } else if (!data || !Array.isArray(data.prompts) || data.prompts.length !== spec.count) return [`Se requieren ${spec.count} prompts`];
  const known = new Set(facts.map(f => f.id));
  const errors = [];
  const seen = new Set();
  for (const [i, row] of data.prompts.entries()) {
    const text = String(row?.prompt ?? '').trim();
    const label = `${category} ${i + 1}`;
    if (row?.n !== i + 1) errors.push(`${label}: número incorrecto`);
    if (category === 'motion-prompts') {
      if (!spec.kinds.includes(row?.kind)) errors.push(`${label}: escena fuera del catálogo`);
    } else if (row?.kind !== spec.kinds[i]) errors.push(`${label}: escena incorrecta`);
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
    if (category === 'motion-prompts') {
      if (!Array.isArray(row.presentations) || row.presentations.length !== 2 || row.presentations[0] !== 'editorial' || row.presentations[1] !== 'statistical' || !/editorial/i.test(text) || !/statistical/i.test(text)) errors.push(`${label}: presentaciones de motion inválidas`);
      if (text.split(/\s+/).length < 150) errors.push(`${label}: dirección insuficientemente detallada`);
      if (!Array.isArray(row.factIds) || row.factIds.some(id => !known.has(id)) || new Set(row.factIds).size !== row.factIds.length) errors.push(`${label}: referencia de hechos inválida`);
      const refs = [...text.matchAll(/\{\{([^{}]+)\}\}/g)].map(m => m[1]);
      if (refs.some(id => !known.has(id) || !row.factIds?.includes(id)) || row.factIds?.some(id => !refs.includes(id))) errors.push(`${label}: los marcadores no coinciden con factIds`);
      if (!published && /%|percent(?:age)?/i.test(text)) errors.push(`${label}: porcentajes no publicados`);
      if (!/Spanish/i.test(text) || !/transition/i.test(text) || !/source|sample/i.test(text)) errors.push(`${label}: faltan rótulos, transiciones o fuente`);
      for (const contractError of motionContractErrors(row, label)) errors.push(contractError);
    }
  }
  return errors;
}
export function validateContent(data, category, matchId, { match = null } = {}) {
  if (category === 'scripts') return scriptStructureErrors(data, { matchId, match }).length === 0;
  if (!data || data.matchId !== matchId || !data.home || !data.away) return false;
  if (data.facts != null && (!Array.isArray(data.facts) || data.facts.length > 128 || data.facts.some(f => !f || typeof f.id !== 'string' || typeof f.label !== 'string' || !Number.isFinite(f.value) || f.value < 0 || typeof f.unit !== 'string' || typeof f.source !== 'string'))) return false;
  if (data.version !== CONTENT_VERSION && data.version !== CONTENT_VERSION - 1) return false;
  return data.category === category && promptErrors(data, { published: data.published === true }).length === 0;
}
