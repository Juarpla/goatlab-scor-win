export const EDITORIAL_ROOT = '/el-juego-en-datos/';
export const EDITORIAL_PAGE_SIZE = 6;
export const EDITORIAL_LIMIT = 20;
export const isEditorialSlug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const editorialPath = slug => `${EDITORIAL_ROOT}${slug}/`;
export const pagePath = page => page === 1 ? EDITORIAL_ROOT : `${EDITORIAL_ROOT}pagina/${page}/`;

export function safeEditorialLink(value) {
  if (typeof value !== 'string' || !URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}

export function relatedEditorials(articles, current) {
  const candidates = articles.filter(entry => entry.slug !== current.slug);
  return candidates.sort((a, b) => Number(b.category === current.category) - Number(a.category === current.category)).slice(0, 3);
}
