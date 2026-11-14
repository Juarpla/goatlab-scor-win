import { readFile, writeFile } from 'node:fs/promises';
import { queryD1 } from './d1-query.mjs';

const articles = JSON.parse(await readFile('dist/client/editorial-seed.json', 'utf8'));
const now = new Date().toISOString();

function entry({ slug, position, published_at, ...payload }) {
  return [slug, position, published_at, now, published_at, JSON.stringify(payload)];
}
const insert = `INSERT INTO editorials (slug, position, published_at, updated_at, checked_at, payload)
  VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET
  payload = json_patch(editorials.payload, excluded.payload), updated_at = excluded.updated_at
  WHERE editorials.retired_at IS NULL AND
    (json_extract(editorials.payload, '$.leadHtml') IS NOT json_extract(excluded.payload, '$.leadHtml')
    OR json_extract(editorials.payload, '$.bodyHtml') IS NOT json_extract(excluded.payload, '$.bodyHtml'))`;

if (process.argv.includes('--local')) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const sql = await readFile('migrations/0002_editorial.sql', 'utf8');
  db.exec(sql);
  const seed = db.prepare(insert);
  for (const article of articles) seed.run(...entry(article));
  const escape = value => `'${String(value).replaceAll("'", "''")}'`;
  await writeFile('/tmp/goatlab-editorials-seed.sql', sql + '\n' + articles.map(article =>
    `INSERT OR IGNORE INTO editorials (slug, position, published_at, updated_at, checked_at, payload) VALUES (${entry(article).map(escape).join(', ')});`,
  ).join('\n'));
} else {
  await queryD1({ sql: await readFile('migrations/0002_editorial.sql', 'utf8') });
  const results = await queryD1({ batch: articles.map(article => ({ sql: insert, params: entry(article) })) });
  console.log(`Verified ${articles.length} seed articles, ${results.reduce((sum, result) => sum + result.meta.changes, 0)} written.`);
}
