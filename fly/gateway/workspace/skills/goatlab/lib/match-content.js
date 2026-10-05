/** Public content contract shared by Actions, Astro and the portable GoatLab skill. */
export const CONTENT_VERSION = 1;
export const CONTENT_PROVIDER_ORDER = 'OPENCODE_GO_FALLBACK_MODEL,OPENCODE_GO_MODEL,MISTRAL_MODEL,WORKERS_AI_MODEL';
export const CONTENT_CATEGORIES = Object.freeze({
  scripts: { label: 'Scripts', directory: 'youtube-scripts', count: 10 },
  'image-prompts': { label: 'Image Prompts', directory: 'image-prompts', count: 10, kinds: ['ball-duel', 'pressing', 'passing', 'dribbling', 'crossing', 'defending', 'aerial-duel', 'goal-action', 'supporters', 'stadium'] },
  'video-prompts': { label: 'Video Prompts', directory: 'video-prompts', count: 5, kinds: ['push-in', 'tracking', 'orbit', 'pull-out', 'focus-transition'] },
  'motion-prompts': { label: 'Motion Prompts', directory: 'motion-prompts', count: 5, kinds: ['form', 'goals', 'clean-sheets', 'head-to-head', 'synthesis'] },
});
export function contentUrl(matchId, category, json = false) {
  if (!CONTENT_CATEGORIES[category]) throw new Error('Categoría desconocida');
  return `/partido/${encodeURIComponent(matchId)}/${category}${json ? '.json' : ''}`;
}
export function promptErrors(data, { category = data?.category, home = data?.home, away = data?.away, facts = data?.facts ?? [], published = false } = {}) {
  const spec = CONTENT_CATEGORIES[category];
  if (!spec?.kinds) return ['Categoría de prompts desconocida'];
  if (!data || !Array.isArray(data.prompts) || data.prompts.length !== spec.count) return [`Se requieren ${spec.count} prompts`];
  const known = new Set(facts.map(f => f.id));
  const errors = [];
  const seen = new Set();
  for (const [i, row] of data.prompts.entries()) {
    const text = String(row?.prompt ?? '').trim();
    const label = `${category} ${i + 1}`;
    if (row?.n !== i + 1 || row?.kind !== spec.kinds[i]) errors.push(`${label}: número o escena incorrectos`);
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
      if (text.split(/\s+/).length < 150) errors.push(`${label}: dirección insuficientemente detallada`);
      if (!Array.isArray(row.factIds) || row.factIds.some(id => !known.has(id)) || new Set(row.factIds).size !== row.factIds.length) errors.push(`${label}: referencia de hechos inválida`);
      const refs = [...text.matchAll(/\{\{([^{}]+)\}\}/g)].map(m => m[1]);
      if (refs.some(id => !known.has(id) || !row.factIds?.includes(id)) || row.factIds?.some(id => !refs.includes(id))) errors.push(`${label}: los marcadores no coinciden con factIds`);
      if (!published && /%|percent(?:age)?/i.test(text)) errors.push(`${label}: porcentajes no publicados`);
      if (!/Spanish/i.test(text) || !/transition/i.test(text) || !/source|sample/i.test(text)) errors.push(`${label}: faltan rótulos, transiciones o fuente`);
    }
  }
  return errors;
}
export function validateContent(data, category, matchId) {
  if (!data || data.matchId !== matchId || !data.home || !data.away) return false;
  if (category === 'scripts') return Array.isArray(data.scripts) && data.scripts.length === 10 && data.scripts.every((s, i) => s.n === i + 1 && typeof s.narration === 'string' && s.narration.trim());
  if (data.facts != null && (!Array.isArray(data.facts) || data.facts.length > 128 || data.facts.some(f => !f || typeof f.id !== 'string' || typeof f.label !== 'string' || !Number.isFinite(f.value) || f.value < 0 || typeof f.unit !== 'string' || typeof f.source !== 'string'))) return false;
  return data.version === CONTENT_VERSION && data.category === category && promptErrors(data, { published: data.published === true }).length === 0;
}
