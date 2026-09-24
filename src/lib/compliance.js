/**
 * Compliance GoatLab Shorts: vocabulario y reglas bloqueantes pre-render.
 * Semilla: COMPLIANCE.md. Sin dependencias npm; corre en Node y workerd.
 */
import { ALLOWED_SOURCES, BANNED_PHOTO_DOMAINS } from './media.js';
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
 * Valida un guion. `published` = evaluation-report.json → published.
 * Con gate cerrado: cero porcentajes (slot de probabilidades apagado).
 */
export function checkScript(script, { published = false, matchId = null } = {}) {
  const errors = [];
  if (!script || typeof script !== 'object') return ['guion vacío'];
  if (!script.hook || String(script.hook).trim().length < 10) errors.push('hook ausente o muy corto');
  const beats = Array.isArray(script.beats) ? script.beats : [];
  if (beats.length < 3 || beats.length > 4) errors.push('el guion necesita 3-4 beats (2-3 métricas + CTA web + cierre)');
  const words = `${script.hook} ${beats.join(' ')}`.split(/\s+/).filter(Boolean).length;
  if (words > 110) errors.push(`guion de ${words} palabras supera el techo de 50s (~110)`);
  const full = `${script.hook} ${beats.join(' ')} ${script.description ?? ''}`.replaceAll(DISCLAIMER, '');
  for (const hit of checkText(full)) errors.push(`vocabulario prohibido: ${hit}`);
  if (!published && /%/.test(full)) errors.push('porcentajes bloqueados: evaluation.published es false');
  const cta = beats.find(b => /goatlab\.win/i.test(b));
  if (!cta) errors.push('falta el beat con CTA a goatlab.win');
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
 * Valida un manifiesto de media-pack: fuentes permitidas, URLs https sin
 * dominios prohibidos, fotógrafo y atribución registrados.
 */
export function checkMediaManifest(data, { matchId = null } = {}) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['manifiesto vacío'];
  if (matchId && data.matchId !== matchId) errors.push(`matchId ${data.matchId} no coincide con ${matchId}`);
  const assets = Array.isArray(data.assets) ? data.assets : [];
  if (!assets.length) errors.push('sin assets: el partido no tiene fotos');
  for (const [i, asset] of assets.entries()) {
    if (!asset || typeof asset !== 'object') {
      errors.push(`asset ${i} vacío`);
      continue;
    }
    if (!ALLOWED_SOURCES.includes(asset.source)) errors.push(`asset ${i}: fuente no permitida (${asset.source})`);
    if (!asset.id) errors.push(`asset ${i}: sin id`);
    for (const field of ['url', 'page', 'photographer']) {
      if (!asset[field] || !String(asset[field]).trim()) errors.push(`asset ${i}: sin ${field}`);
    }
    for (const field of ['url', 'page', 'photographerUrl']) {
      const value = String(asset[field] ?? '');
      if (!value) continue;
      if (!/^https:\/\//.test(value)) errors.push(`asset ${i}: ${field} no es https`);
      for (const banned of BANNED_PHOTO_DOMAINS) {
        if (banned.test(value)) errors.push(`asset ${i}: dominio prohibido en ${field}`);
      }
    }
  }
  if (!String(data.attribution ?? '').trim()) errors.push('falta la atribución de fotos');
  return errors;
}
