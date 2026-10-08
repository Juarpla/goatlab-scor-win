/**
 * Compliance GoatLab Shorts: vocabulario y reglas bloqueantes pre-render.
 * Semilla: COMPLIANCE.md. Sin dependencias npm; corre en Node y workerd.
 */
import { ASSETS_MIN, ASSETS_PER_MATCH, AI_CREDIT, assetErrors,
} from './media.js';
export const DISCLAIMER =
  'Análisis con fines educativos e informativos. No es asesoría de apuestas y no garantiza resultados.';

/** Vocabulario prohibido en guiones y descripciones (apuestas, cuotas, garantías). */
export const FORBIDDEN_PATTERNS = [
  /cuotas?/i,
  /momios?/i,
  /apuestas?/i,
  /apostar/i,
  /\bstake\b/i,
  /bankroll/i,
  /tipster/i,
  /\bbono\b/i,
  /casino/i,
  /parlay/i,
  /combinada/i,
  /hándicap|handicap/i,
  /fija segura/i,
  /seguro al 100/i,
  /100\s?%\s?seguro/i,
  /garantizad[oa]/i,
  /gana seguro/i,
  /casas?\s+de\s+apuestas?/i,
  /bet365|betsson|coolbet|doradobet|apuesta total/i,
  /\b1X2\b/,
  /\bBTTS\b/i,
  /\bDNB\b/i,
  /\bH2H\b/i,
  /HT\/FT/i,
  /footage|transmisi[oó]n en vivo/i,
];

/** Claves crudas que jamás se imprimen (ver story-dictionary). */
export const RAW_KEYS = ['1X2', 'BTTS', 'DNB', 'H2H', 'HT/FT'];

export function checkText(text) {
  const value = String(text ?? '');
  const hits = [];
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(value)) hits.push(pattern.source);
  }
  return hits;
}

/**
 * Valida un guion (texto corrido listo para leer). `published` =
 * evaluation-report.json → published. Con gate cerrado: cero porcentajes
 * (slot de probabilidades apagado).
 */
export function checkScript(script, { published = false, matchId = null } = {}) {
  const errors = [];
  if (!script || typeof script !== 'object') return ['guion vacío'];
  if (!script.hook || String(script.hook).trim().length < 10) errors.push('hook ausente o muy corto');
  const narration = String(script.narration ?? '').trim();
  if (!narration) {
    errors.push('narración ausente');
  } else {
    const words = narration.split(/\s+/).filter(Boolean).length;
    if (words > 110) errors.push(`guion de ${words} palabras supera el techo de 50s (~110)`);
    if (!/goatlab\.win/i.test(narration)) errors.push('falta la CTA a goatlab.win en la narración');
  }
  const full = `${script.hook} ${narration} ${script.description ?? ''}`.replaceAll(DISCLAIMER, '');
  for (const hit of checkText(full)) errors.push(`vocabulario prohibido: ${hit}`);
  if (!published && /%/.test(full)) errors.push('porcentajes bloqueados: evaluation.published es false');
  return errors;
}

export function checkDescription(description, { matchId = null } = {}) {
  const errors = [];
  const value = String(description ?? '');
  if (!value.trim()) return ['descripción vacía'];
  if (matchId && !value.includes(`https://goatlab.win/partido/${matchId}`)) {
    errors.push('falta el enlace https://goatlab.win/partido/<id>');
  }
  if (!value.includes('🔗')) errors.push('falta el prefijo 🔗 del enlace');
  if (!/#goatlab/i.test(value)) errors.push('falta el hashtag #goatlab');
  if (!value.includes(DISCLAIMER)) errors.push('falta el disclaimer fijo');
  const scannable = value.replaceAll(DISCLAIMER, '');
  for (const hit of checkText(scannable)) errors.push(`vocabulario prohibido: ${hit}`);
  return errors;
}

/**
 * Agnes bank: zero to ten images, generation provenance and referential credit.
 */
export function checkMediaManifest(data, { matchId = null } = {}) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['manifiesto vacío'];
  if (matchId && data.matchId !== matchId) errors.push(`matchId ${data.matchId} no coincide con ${matchId}`);
  const assets = Array.isArray(data.assets) ? data.assets : [];
  if (assets.length < ASSETS_MIN) errors.push(`faltan fotos: ${assets.length} < ${ASSETS_MIN}`);
  if (assets.length > ASSETS_PER_MATCH) errors.push(`sobran fotos: ${assets.length} > ${ASSETS_PER_MATCH}`);
  for (const [i, asset] of assets.entries()) for (const error of assetErrors(asset)) errors.push(`asset ${i}: ${error}`);
  if (assets.length && !String(data.attribution ?? '').trim()) errors.push('falta la atribución de fotos');
  if (assets.some(asset => asset?.source === 'agnes') && !String(data.attribution ?? '').includes(AI_CREDIT)) {
    errors.push('falta el aviso de imágenes generadas con IA');
  }
  return errors;
}

/** Solo <id>.json son manifiestos; .progress.json y .ready son notas de avance. */
export function isMediaManifestFile(name) {
  return typeof name === 'string' && name.endsWith('.json') && !name.endsWith('.progress.json') && !name.endsWith('.ready');
}
