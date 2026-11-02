export const VISUAL_STYLES = Object.freeze({
  editorial: 'Libre / editorial',
  documentary: 'Documental deportivo',
  trailer: 'Tráiler deportivo',
});

export function isVisualStyle(value) {
  return typeof value === 'string' && Object.hasOwn(VISUAL_STYLES, value);
}
