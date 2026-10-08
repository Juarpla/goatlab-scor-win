import test from 'node:test';
import assert from 'node:assert/strict';

process.env.R2_NO_DOTENV = '1';
process.env.R2_PUBLIC_BASE = 'https://pub-test.r2.dev';
const { sign, publicUrl, BUDGET, parseR2List, delPrefix } = await import('../scripts/r2-media.mjs');

const V = { access: 'AKID', secret: 'SECRET', bucket: 'goatlab', host: 'x.r2.cloudflarestorage.com', date: new Date('2026-01-01T00:00:00Z') };

test('sign es determinista y firma distinto secreto distinto', () => {
  const a = sign({ method: 'PUT', key: 'partidos/a-b/0.jpg', bodyHash: 'abc', headers: { 'content-type': 'image/jpeg' }, ...V });
  const b = sign({ method: 'PUT', key: 'partidos/a-b/0.jpg', bodyHash: 'abc', headers: { 'content-type': 'image/jpeg' }, ...V });
  const c = sign({ method: 'PUT', key: 'partidos/a-b/0.jpg', bodyHash: 'abc', headers: { 'content-type': 'image/jpeg' }, ...V, secret: 'OTRO' });
  assert.equal(a.headers.Authorization, b.headers.Authorization);
  assert.notEqual(a.headers.Authorization, c.headers.Authorization);
  assert.match(a.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=AKID\/20260101\/auto\/s3\/aws4_request, SignedHeaders=.+, Signature=[0-9a-f]{64}$/);
  assert.equal(a.url, 'https://x.r2.cloudflarestorage.com/goatlab/partidos/a-b/0.jpg');
});

test('sign codifica la llave sin romper las barras', () => {
  const { url } = sign({ method: 'GET', key: 'partidos/a b/0.jpg', bodyHash: 'abc', ...V });
  assert.ok(url.includes('/goatlab/partidos/a%20b/0.jpg'));
});

test('publicUrl une base y llave codificada', () => {
  assert.equal(publicUrl('partidos/a-b/clip-0.mp4'), 'https://pub-test.r2.dev/partidos/a-b/clip-0.mp4');
});

test('topes internos al 80% del free tier', () => {
  assert.equal(BUDGET.storageBytes, 8_000_000_000);
  assert.equal(BUDGET.opsA, 800_000);
  assert.equal(BUDGET.opsB, 8_000_000);
});

test('LIST parses real S3 element order and decodes XML before validating the prefix', () => {
  const xml = '<ListBucketResult><Contents><Key>partidos/a-b/0&amp;1.jpg</Key><LastModified>2026-10-08</LastModified><ETag>hash</ETag><Size>123</Size></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>a&amp;b</NextContinuationToken></ListBucketResult>';
  assert.deepEqual(parseR2List(xml, 'partidos/a-b/'), { objects: [{ key: 'partidos/a-b/0&1.jpg', bytes: 123 }], next: 'a&b' });
  assert.throws(() => parseR2List(xml, 'partidos/a-b-extra/'), /fuera del prefijo/);
  assert.throws(() => parseR2List('<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>', 'partidos/'), /paginación incompleta/);
  assert.throws(() => parseR2List('<Error>offline</Error>', 'partidos/'), /inválido/);
});

test('DELETE prefix requires a validated exact match ID and trailing slash', async () => {
  for (const prefix of ['partidos/a-b', 'partidos/', 'partidos/../', 'partidos/a-b/other/', 'other/a-b/']) await assert.rejects(delPrefix(prefix), /prefijo de partido inválido/);
});
