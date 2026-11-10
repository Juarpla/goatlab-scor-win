/** Public content contract shared by Actions, Astro and the portable GoatLab skill. */
import { esName } from './teams.js';
import { beatStructureErrors, matchDateSentence, narrationText, scriptBeats } from './script-beats.js';
export const CONTENT_VERSION = 1;
export const CONTENT_PROVIDER_ORDER = 'OPENCODE_GO_MODEL,OPENCODE_GO_FALLBACK_MODEL,MISTRAL_MODEL,WORKERS_AI_MODEL';
export const CONTENT_CATEGORIES = Object.freeze({
  scripts: { label: 'Scripts', directory: 'youtube-scripts', count: 10 },
  'image-prompts': { label: 'Image Prompts', directory: 'image-prompts', count: 12, kinds: ['ball-duel', 'goal-action', 'ball-duel-in-the-air', 'stadium', 'supporters', 'goalkeeper-save', 'free-kick', 'corner-kick', 'dribble', 'tackle', 'celebration', 'floodlights'], legacyKinds: ['ball-duel', 'goal-action', 'ball-duel-in-the-air', 'stadium'] },
});
export function contentUrl(matchId, category, json = false) {
  if (!CONTENT_CATEGORIES[category]) throw new Error('Categoría desconocida');
  return `/partido/${encodeURIComponent(matchId)}/${category}${json ? '.json' : ''}`;
}

/** Contract-critical words per image kind: models drop them on some entries. */
export const IMAGE_PROMPT_SCENE_WORDS = Object.freeze({
  'ball-duel': 'A tight duel for the ball between both squads.',
  'goal-action': 'A goalmouth shot with the ball heading to the net.',
  'ball-duel-in-the-air': 'An aerial duel with the ball clearly in the air: players jumping and heading.',
  'stadium': 'The stadium stands, stadium flags and the team crests.',
  'supporters': 'The supporters, fans and crowd of the home side in the foreground.',
  'goalkeeper-save': 'The goalkeeper denies a close-range shot with a decisive save.',
  'free-kick': 'A direct free kick over the defensive wall.',
  'corner-kick': 'A corner kick delivered into the crowded area.',
  'dribble': 'A dribble past a defender at full speed.',
  'tackle': 'A clean tackle challenge for the ball.',
  'celebration': 'The celebration right after a goal with raised arms.',
  'floodlights': 'The full floodlights turning the night stadium into a stage.',
});

/** LLM drafts lose boilerplate under long guides; append the contract text deterministically. */
export function mendImagePromptBoilerplate(prompt, { home, away, kind } = {}) {
  let text = String(prompt ?? '').trim();
  const appendix = [
    'Render requirements for the generated illustration: referential photorealistic illustration, vertical 9:16 aspect.',
    'Show realistic uniforms, team colours and visual identity, and always contrast the kits of the two sides; when the two home kits are too close in colour, the away team wears its alternative kit.',
  ];
  const scene = IMAGE_PROMPT_SCENE_WORDS[kind];
  if (scene) appendix.push(scene);
  const missingSides = [home, away].filter(side => side && !text.includes(side));
  if (missingSides.length) appendix.push(`Featured teams: ${missingSides.join(' and ')}.`);
  if (text) text += (/[.!?]$/.test(text) ? ' ' : ' ') + appendix.filter(Boolean).join(' ');
  else text = appendix.filter(Boolean).join(' ');
  return text;
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
  const expectedDate = matchDateSentence(data.kickoff);
  if (Array.isArray(data.scripts)) for (const [index, script] of data.scripts.entries()) {
    const label = `guion ${index + 1}`;
    const rawNarration = script?.narration;
    const narration = narrationText(rawNarration);
    if (script?.n !== index + 1) errors.push(`${label}: número incorrecto`);
    for (const field of ['title', 'hook']) if (!nonempty(script?.[field])) errors.push(`${label}: ${field} vacío o inválido`);
    if (typeof rawNarration !== 'string' && !Array.isArray(rawNarration)) errors.push(`${label}: narration vacía o inválida`);
    else if (!narration) errors.push(`${label}: narration vacía o inválida`);
    if (Array.isArray(script?.narration)) {
      for (const error of beatStructureErrors(script.narration)) errors.push(`${label}: ${error}`);
    }
    if (Number(data.editorialVersion) >= 3) {
      if (!Array.isArray(script?.narration)) errors.push(`${label}: la versión editorial estructurada exige narración por golpes`);
      else {
        const beats = scriptBeats(script.narration);
        const gancho = beats.find(beat => beat.beat === 'gancho')?.text ?? '';
        const proyeccion = beats.find(beat => beat.beat === 'proyeccion')?.text ?? '';
        const fecha = beats.find(beat => beat.beat === 'fecha')?.text ?? '';
        if (String(script?.hook ?? '').trim() !== gancho) errors.push(`${label}: el gancho debe coincidir con el golpe gancho`);
        if (String(script?.projection ?? '').trim() !== proyeccion) errors.push(`${label}: la proyección debe coincidir con el golpe proyección`);
        if (expectedDate && fecha !== expectedDate) errors.push(`${label}: la fecha debe coincidir con kickoff`);
      }
    }
    if (!Number.isInteger(script?.words) || script.words <= 0) errors.push(`${label}: words debe ser un entero positivo`);
    if (Number(data.editorialVersion) >= 2 && (!nonempty(script?.projection) || !narration.includes(script.projection))) errors.push(`${label}: proyección editorial ausente de la narración`);
    // The pick only exists since the precedent+forecast improvement; old
    // JSONs without a pick remain valid, but a present pick must have a shape.
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
    if (row?.kind !== spec.kinds[i] && row?.kind !== spec.legacyKinds?.[i]) errors.push(`${label}: escena incorrecta`);
    if (typeof row?.title !== 'string' || !row.title.trim() || row.title.length > 160) errors.push(`${label}: título inválido`);
    if (text.length < 180 || text.length > 12000 || !/9\s*:\s*16/.test(text)) errors.push(`${label}: texto incompleto o formato ausente`);
    if (seen.has(text.toLowerCase())) errors.push(`${label}: prompt repetido`);
    seen.add(text.toLowerCase());
    if (category === 'image-prompts') {
      if (!home || !away || !text.includes(home) || !text.includes(away)) errors.push(`${label}: faltan ambos equipos`);
      if (!/photoreal|hyperreal/i.test(text) || !/referential|reference illustration/i.test(text) || !/illustration/i.test(text)) errors.push(`${label}: falta realismo y carácter referencial`);
      if (!/kit|uniform|shirt|jersey|colou?r/i.test(text)) errors.push(`${label}: falta identidad de los equipos`);
      if (row.kind === 'supporters' && !/supporters|fans|crowd/i.test(text)) errors.push(`${label}: falta hinchada`);
      if (row.kind === 'goalkeeper-save' && (!/goalkeeper|keeper/i.test(text) || !/save|deny|block|stop/i.test(text))) errors.push(`${label}: falta atajada del portero`);
      if (row.kind === 'free-kick' && !/free[- ]?kick/i.test(text)) errors.push(`${label}: falta tiro libre`);
      if (row.kind === 'corner-kick' && !/corner/i.test(text)) errors.push(`${label}: falta córner`);
      if (row.kind === 'dribble' && !/dribbl/i.test(text)) errors.push(`${label}: falta regate`);
      if (row.kind === 'tackle' && !/tackle|challeng/i.test(text)) errors.push(`${label}: falta entrada`);
      if (row.kind === 'celebration' && !/celebrat/i.test(text)) errors.push(`${label}: falta celebración`);
      if (row.kind === 'floodlights' && !/floodlight|night/i.test(text)) errors.push(`${label}: falta nocturna con reflectores`);
      if (row.kind === 'ball-duel-in-the-air' && (!/\bball\b/i.test(text) || !/\b(?:air|aerial|header|heading|volley|overhead)\b/i.test(text))) errors.push(`${label}: falta duelo aéreo`);
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
  // Accepts v1 and v2: banks generated with CONTENT_VERSION 2 remain valid.
  if (data.version !== CONTENT_VERSION && data.version !== CONTENT_VERSION + 1) return false;
  return data.category === category && promptErrors(data, { published: data.published === true }).length === 0;
}
