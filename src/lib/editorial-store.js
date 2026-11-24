import { EDITORIAL_PAGE_SIZE, isEditorialSlug } from './editorial.js';

const columns = `slug, position, json_extract(payload, '$.title') AS title,
  json_extract(payload, '$.description') AS description, json_extract(payload, '$.category') AS category,
  json_extract(payload, '$.media.cover') AS cover`;

export async function listEditorials(db) {
  const { results } = await db.prepare(`SELECT ${columns}, updated_at FROM editorials WHERE retired_at IS NULL ORDER BY position, slug`).all();
  return results.filter(row => isEditorialSlug(row.slug)).map(row => ({ ...row, cover: typeof row.cover === 'string' ? JSON.parse(row.cover) : row.cover }));
}

export async function getEditorial(db, slug) {
  if (!isEditorialSlug(slug)) return null;
  const row = await db.prepare('SELECT slug, published_at, updated_at, retired_at, payload FROM editorials WHERE slug = ?').bind(slug).first();
  if (!row || row.retired_at) return row;
  return { ...JSON.parse(row.payload), slug: row.slug, published_at: row.published_at, updated_at: row.updated_at };
}

export async function editorialPage(db, page, response) {
  response.headers.set('Cache-Control', 'no-store');
  if (!Number.isSafeInteger(page) || page < 1) {
    response.status = 404;
    return null;
  }
  try {
    const articles = await listEditorials(db);
    const pages = Math.max(1, Math.ceil(articles.length / EDITORIAL_PAGE_SIZE));
    if (page > pages) {
      response.status = 404;
      return null;
    }
    return { page, pages, visible: articles.slice((page - 1) * EDITORIAL_PAGE_SIZE, page * EDITORIAL_PAGE_SIZE) };
  } catch (error) {
    console.error('Editorial listing unavailable', error);
    response.status = 503;
    response.headers.set('Retry-After', '300');
    return null;
  }
}
