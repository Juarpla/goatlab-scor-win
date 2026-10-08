import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hkdfSync, createCipheriv, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { saveRecovery, restoreRecovery } from '../scripts/media-recovery.mjs';

const secret = 'a private test key that never goes into output';
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'goatlab-recovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { dir: join(root, 'gen'), file: join(root, 'recovery.enc'), secret, root };
}
function forged(payload) {
  const header = Buffer.from('GOATLAB-AGNES-RECOVERY\x01'), iv = randomBytes(12);
  const key = hkdfSync('sha256', Buffer.from(secret), Buffer.from('goatlab-application-recovery-v1'), Buffer.from('agnes-media-cache-aes-256-gcm'), 32);
  const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(header);
  return Buffer.concat([header, iv, cipher.update(gzipSync(Buffer.from(JSON.stringify(payload)))), cipher.final(), cipher.getAuthTag()]);
}

test('encrypted recovery round-trips responses, metadata and binary media with private permissions', async t => {
  const options = await setup(t); await mkdir(join(options.dir, 'safe-match'), { recursive: true });
  const fixtures = { '0.response.json': Buffer.from('{"data":"private response"}'), '0.json': Buffer.from('{"prompt":"private prompt"}'), 'clip-4.mp4': Buffer.from([0, 1, 255]), '0.png': Buffer.from('image bytes') };
  for (const [name, bytes] of Object.entries(fixtures)) await writeFile(join(options.dir, 'safe-match', name), bytes);
  await writeFile(join(options.dir, 'safe-match', 'agnes.sqlite'), 'not recoverable');
  assert.deepEqual(await saveRecovery(options), { saved: true, count: 4 });
  const archive = await readFile(options.file);
  assert.equal(archive.includes(Buffer.from('private response')), false);
  assert.equal((await stat(options.file)).mode & 0o777, 0o600);
  await rm(options.dir, { recursive: true });
  assert.deepEqual(await restoreRecovery(options), { restored: true, count: 4 });
  for (const [name, bytes] of Object.entries(fixtures)) {
    const path = join(options.dir, 'safe-match', name);
    assert.deepEqual(await readFile(path), bytes);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  }
  await assert.rejects(readFile(join(options.dir, 'safe-match', 'agnes.sqlite')), { code: 'ENOENT' });
});

test('wrong key and tampering authenticate before any cleartext writes', async t => {
  const options = await setup(t); await writeFile(options.file, forged({ version: 1, files: [{ path: 'm/0.json', data: 'e30=' }] }));
  await assert.rejects(restoreRecovery({ ...options, secret: 'wrong-key' }), /autenticada/);
  await assert.rejects(stat(options.dir), { code: 'ENOENT' });
  const bytes = await readFile(options.file); bytes[bytes.length - 1] ^= 1; await writeFile(options.file, bytes);
  await assert.rejects(restoreRecovery(options), /autenticada/);
  await assert.rejects(stat(options.dir), { code: 'ENOENT' });
});

test('authenticated traversal or duplicate paths reject the entire archive', async t => {
  const options = await setup(t);
  for (const path of ['../0.json', 'm/../../0.json', '/m/0.json', 'm/agnes.sqlite']) {
    await writeFile(options.file, forged({ version: 1, files: [{ path: 'm/0.json', data: 'e30=' }, { path, data: 'e30=' }] }));
    await assert.rejects(restoreRecovery(options), /inválido/);
    await assert.rejects(stat(options.dir), { code: 'ENOENT' });
  }
  await writeFile(options.file, forged({ version: 1, files: [{ path: 'm/0.json', data: 'e30=' }, { path: 'm/0.json', data: 'e30=' }] }));
  await assert.rejects(restoreRecovery(options), /inválido/);
});

test('symlink sources and restore destinations are rejected', async t => {
  const options = await setup(t); await mkdir(join(options.dir, 'm'), { recursive: true });
  const outside = join(options.root, 'outside.json'); await writeFile(outside, 'private');
  await symlink(outside, join(options.dir, 'm', '0.json'));
  await assert.rejects(saveRecovery(options), /no regular/);
  await writeFile(options.file, forged({ version: 1, files: [{ path: 'm/0.json', data: 'e30=' }] }));
  await assert.rejects(restoreRecovery(options), /no regular/);
  assert.equal(await readFile(outside, 'utf8'), 'private');
});

test('absent recovery files and absent source directory are safe no-ops', async t => {
  const options = await setup(t);
  assert.deepEqual(await saveRecovery(options), { saved: false, count: 0 });
  assert.deepEqual(await restoreRecovery(options), { restored: false, count: 0 });
});
