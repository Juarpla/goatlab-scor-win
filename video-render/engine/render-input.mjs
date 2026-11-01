import { basename, join } from 'node:path';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { normalizePhoto, photoProfile } from './photo-normalization.mjs';

export function compositionFiles(props) {
  const names = [props.font, props.brand, ...(props.photos || []).flatMap(p => [p.src, p.backdrop, p.focusBlur]), ...(props.clips || []).map(c => c.src)].filter(Boolean);
  for (const name of names) if (typeof name !== 'string' || name !== basename(name) || name === '.' || name === '..') throw new Error('recurso de composición debe ser un archivo local');
  return [...new Set(names)];
}

/** A self-contained copy: never render or resize inside the original job directory. */
export async function copyRenderInput(source, target, { photoMax } = {}) {
  if (existsSync(join(source, 'evaluation.json')) && JSON.parse(readFileSync(join(source, 'evaluation.json'), 'utf8')).expiresAt <= Date.now()) throw new Error('muestra de evaluación caducada');
  const props = JSON.parse(readFileSync(join(source, 'composition.json'), 'utf8'));
  mkdirSync(target, { recursive: true });
  for (const name of compositionFiles(props)) copyFileSync(join(source, name), join(target, name));
  if (photoMax !== undefined) {
    const profile = photoProfile(photoMax);
    for (const photo of props.photos || []) Object.assign(photo, await normalizePhoto(join(source, photo.src), join(target, photo.src), profile));
  }
  writeFileSync(join(target, 'composition.json'), JSON.stringify(props));
  return props;
}

export function benchmarkSchedule(configurations, runs = 3) {
  const schedule = configurations.map(config => ({ ...config, run: 0, phase: 'cold-bundle' }));
  for (let run = 1; run <= runs; run++) {
    const ordered = run % 2 ? [...configurations].reverse() : [...configurations];
    // Rotate the starting condition as well as reversing to reduce shared-host timing bias.
    const offset = (run - 1) % Math.max(1, ordered.length);
    for (const config of [...ordered.slice(offset), ...ordered.slice(0, offset)]) schedule.push({ ...config, run, phase: 'warm-bundle' });
  }
  return schedule;
}
