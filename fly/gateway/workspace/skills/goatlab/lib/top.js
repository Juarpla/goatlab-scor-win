/** Top-5 por relevancia como dato compartido: se calcula en 1-update-data y
 *  todos los consumidores (guiones, prompts, banco de medios) leen el mismo.
 *  `extra` protege peticiones manuales (--match o top ampliado) de la poda. */
export const TOP_FILENAME = 'top.json';
export const TOP_VERSION = 1;

export function defaultTopN(env = {}) {
  const n = Number(env?.SCRIPT_TOP_N);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 5;
}

export function rankingIds(top) {
  return (top?.ranking ?? []).map(r => r?.id).filter(Boolean);
}

/** Conjunto efectivo: ranking.slice(0, n) ∪ extra, sin duplicados. */
export function effectiveIds(top, n) {
  const keep = new Set([...rankingIds(top).slice(0, Math.max(0, n)), ...(top?.extra ?? [])]);
  return [...keep];
}

/** Ids NS vivos según fixtures (los extras caducan al jugarse el partido). */
export function liveIds(matches) {
  return new Set((matches ?? []).filter(m => m?.status === 'NS').map(m => m.webId ?? m.id));
}

/** Fusiona ids manuales en extra; devuelve el top actualizado y lo añadido. */
export function registerExtra(top, ids) {
  const base = Array.isArray(top?.extra) ? top.extra : [];
  const have = new Set(base);
  const added = (ids ?? []).filter(id => id && !have.has(id));
  for (const id of added) have.add(id);
  return { top: { ...(top ?? { ranking: [] }), extra: [...have] }, added };
}

/** Expulsa de extra los ids que ya no están en la ventana NS. */
export function pruneExtra(top, live) {
  const alive = live instanceof Set ? live : new Set(live ?? []);
  const extra = (top?.extra ?? []).filter(id => alive.has(id));
  return { ...(top ?? { ranking: [] }), extra };
}
