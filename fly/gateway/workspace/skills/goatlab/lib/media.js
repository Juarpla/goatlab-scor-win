/** Agnes-only per-match bank. Search adapters and stock-photo selection are retired. */
import { esName } from './teams.js';
export const ASSETS_PER_MATCH = 4;
export const ASSETS_MIN = 0;
export const AGNES_MAX_IMAGES = 4;
export const ALLOWED_SOURCES = ['agnes'];
export const AI_CREDIT = 'Imágenes y clips referenciales generados con IA (Agnes AI)';
export const CAMERA_MOVES = ['pan-left','pan-right','push','pull','tilt','rise','drift','cut-in','slide','hold-push'];
export function assetErrors(asset) {
  if (!asset || typeof asset !== 'object') return ['recurso vacío'];
  const errors = [];
  if (asset.source !== 'agnes') errors.push('solo se admite Agnes AI');
  if (!asset.id) errors.push('sin id');
  if (!/^https:\/\//.test(String(asset.url ?? ''))) errors.push('URL no permitida');
  if (!asset.generated?.model || !Number.isFinite(Date.parse(asset.generated?.at))) errors.push('sin modelo o fecha de generación');
  if (!(asset.width > 0 && asset.height > 0)) errors.push('sin dimensiones');
  return errors;
}
export function selectAssets(assets, { total = ASSETS_PER_MATCH } = {}) {
  return [...new Map((assets ?? []).filter(a => !assetErrors(a).length).map(a => [a.id, a])).values()].slice(0, Math.min(total, ASSETS_PER_MATCH));
}
export function buildAttribution(assets) { return assets?.some(a => a.source === 'agnes') ? AI_CREDIT : ''; }
export function buildManifest({ match, assets }) {
  const list = selectAssets(assets);
  return { matchId: match.webId ?? match.id, match: `${esName(match.home)} vs ${esName(match.away)}`,
    home: esName(match.home), away: esName(match.away), competition: match.competition ?? null, kickoff: match.kickoff ?? null,
    queries: [...new Set(list.map(a => a.query).filter(Boolean))], assets: list, attribution: buildAttribution(list) };
}
