/** Lector del banco de medios por partido para la ruta /partido/<id>/media.
 *  Lee los manifiestos que commitea el Action 3-media-creation y los sanea
 *  al contrato vivo 4 fotos + 2 clips (los bancos legacy llegan más grandes).
 *  Solo lectura en build (Astro estático); sin secrets ni red. */
import { readdirSync, readFileSync } from 'node:fs';
import { ASSETS_PER_MATCH, CLIPS_PER_MATCH } from './media.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const HTTPS = /^https:\/\//;

const read = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };

/** Ids con manifiesto (excluye .progress.json y .ready). */
export function mediaBankIds(dir = 'public/data/media-pack') {
  let names = [];
  try { names = readdirSync(dir); } catch { return []; }
  return [...new Set(names
    .filter(name => name.endsWith('.json'))
    .map(name => name.replace(/(?:\.progress)?\.json$/, ''))
    .filter(id => ID.test(id)))];
}

function validAsset(asset) {
  return asset?.source === 'agnes' && HTTPS.test(String(asset.url ?? '')) ? asset : null;
}

function validClip(clip) {
  return clip?.source === 'agnes' && HTTPS.test(String(clip.url ?? '')) ? clip : null;
}

/** Manifiesto + progreso saneados, o null si no hay banco para el partido. */
export function readMediaBank(matchId, dir = 'public/data/media-pack') {
  if (!ID.test(String(matchId ?? ''))) return null;
  const progress = read(`${dir}/${matchId}.progress.json`);
  const manifest = read(`${dir}/${matchId}.json`) ?? (progress ? {matchId,match:matchId,bankStatus:'partial',assets:[],clips:[]} : null);
  if (!manifest || manifest.matchId !== matchId) return null;
  const assets = (manifest.assets ?? []).map(validAsset).filter(Boolean).slice(0, ASSETS_PER_MATCH);
  const clips = (manifest.clips ?? []).map(validClip).filter(Boolean).slice(0, CLIPS_PER_MATCH);
  return {
    matchId,
    match: manifest.match ?? `${manifest.home ?? ''} vs ${manifest.away ?? ''}`.trim(),
    home: manifest.home ?? null,
    away: manifest.away ?? null,
    competition: manifest.competition ?? null,
    kickoff: manifest.kickoff ?? null,
    generatedAt: manifest.generatedAt ?? null,
    bankStatus: manifest.bankStatus ?? (assets.length === ASSETS_PER_MATCH && clips.length === CLIPS_PER_MATCH ? 'complete' : 'partial'),
    attribution: manifest.attribution ?? '',
    assets,
    clips,
    failures: Array.isArray(progress?.failures) ? progress.failures : [],
    diagnostics: Array.isArray(progress?.diagnostics) ? progress.diagnostics : [],
    runUrl: /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/.test(progress?.runUrl ?? '') ? progress.runUrl : null,
    updatedAt: progress?.updatedAt ?? null,
    verifiedImages: progress?.verifiedImages ?? assets.length,
    verifiedClips: progress?.verifiedClips ?? clips.length,
    phase: progress?.phase ?? null,
  };
}
