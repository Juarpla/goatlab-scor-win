/** Private, authenticated recovery cache. Only an encrypted archive leaves the runner. */
import { readFile, readdir, lstat, mkdir, writeFile, rename, rm, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { randomBytes, randomUUID, hkdfSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { resolveStateConfig } from '../src/lib/r2-state-config.js';

const HEADER = Buffer.from('GOATLAB-AGNES-RECOVERY\x01');
const RAW_MAX = 128_000_000, JSON_MAX = 180_000_000, ARCHIVE_MAX = 128_000_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\.(?:json|txt|png|jpg|jpeg|webp|mp4)$/;
const safePath = path => typeof path === 'string' && path.split('/').length === 2
  && ID.test(path.split('/')[0]) && NAME.test(path.split('/')[1]) && !/sqlite/i.test(path);
const key = secret => {
  if (typeof secret !== 'string' || !secret.trim()) throw new Error('falta la clave privada de recuperación');
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret), Buffer.from('goatlab-application-recovery-v1'), Buffer.from('agnes-media-cache-aes-256-gcm'), 32));
};
async function stat(path) { try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function atomic(path, bytes) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = path + '.' + randomUUID() + '.tmp';
  try { await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

export async function saveRecovery({ dir = 'public/data/media-pack/gen', file = '.cache/agnes-recovery.enc', secret = resolveStateConfig(process.env).secret } = {}) {
  const root = await stat(dir);
  if (!root) return { saved: false, count: 0 };
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('directorio de recuperación inválido');
  const encryptionKey = key(secret), files = []; let rawBytes = 0;
  for (const id of (await readdir(dir)).sort()) {
    if (!ID.test(id)) continue;
    const folder = join(dir, id), metadata = await stat(folder);
    if (!metadata?.isDirectory() || metadata.isSymbolicLink()) throw new Error('carpeta de recuperación no regular');
    for (const name of (await readdir(folder)).sort()) {
      const path = id + '/' + name;
      if (!safePath(path)) continue;
      const source = join(folder, name), info = await stat(source);
      if (!info?.isFile() || info.isSymbolicLink()) throw new Error('archivo de recuperación no regular');
      rawBytes += info.size;
      if (rawBytes > RAW_MAX || files.length >= 1024) throw new Error('recuperación supera el presupuesto');
      const handle = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
      let bytes;
      try {
        const current = await handle.stat();
        if (!current.isFile() || current.size !== info.size) throw new Error('archivo de recuperación cambió durante lectura');
        bytes = await handle.readFile();
      } finally { await handle.close(); }
      if (bytes.length !== info.size) throw new Error('archivo de recuperación cambió durante lectura');
      files.push({ path, data: bytes.toString('base64') });
    }
  }
  const plaintext = Buffer.from(JSON.stringify({ version: 1, files }));
  if (plaintext.length > JSON_MAX) throw new Error('recuperación supera el presupuesto');
  const compressed = gzipSync(plaintext);
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  cipher.setAAD(HEADER);
  const archive = Buffer.concat([HEADER, iv, cipher.update(compressed), cipher.final(), cipher.getAuthTag()]);
  if (archive.length > ARCHIVE_MAX) throw new Error('recuperación supera el presupuesto');
  await atomic(file, archive);
  return { saved: true, count: files.length };
}

export async function restoreRecovery({ dir = 'public/data/media-pack/gen', file = '.cache/agnes-recovery.enc', secret = resolveStateConfig(process.env).secret } = {}) {
  const info = await stat(file);
  if (!info) return { restored: false, count: 0 };
  if (!info.isFile() || info.isSymbolicLink() || info.size > ARCHIVE_MAX) throw new Error('archivo cifrado de recuperación inválido');
  const archive = await readFile(file);
  if (archive.length < HEADER.length + 28 || !archive.subarray(0, HEADER.length).equals(HEADER)) throw new Error('versión de recuperación incompatible');
  const decipher = createDecipheriv('aes-256-gcm', key(secret), archive.subarray(HEADER.length, HEADER.length + 12));
  decipher.setAAD(HEADER); decipher.setAuthTag(archive.subarray(-16));
  let payload;
  try {
    const compressed = Buffer.concat([decipher.update(archive.subarray(HEADER.length + 12, -16)), decipher.final()]);
    payload = JSON.parse(gunzipSync(compressed, { maxOutputLength: JSON_MAX }).toString('utf8'));
  } catch { throw new Error('recuperación no autenticada o corrupta'); }
  if (!payload || payload.version !== 1 || !Array.isArray(payload.files) || payload.files.length > 1024
    || Object.keys(payload).some(name => !['version', 'files'].includes(name))) throw new Error('contenido de recuperación inválido');
  const files = [], paths = new Set(); let size = 0;
  for (const entry of payload.files) {
    if (!entry || Object.keys(entry).some(name => !['path', 'data'].includes(name)) || !safePath(entry.path)
      || paths.has(entry.path) || typeof entry.data !== 'string' || entry.data.length > JSON_MAX) throw new Error('ruta o archivo de recuperación inválido');
    const bytes = Buffer.from(entry.data, 'base64'); size += bytes.length;
    if (bytes.toString('base64') !== entry.data) throw new Error('archivo de recuperación inválido');
    if (size > RAW_MAX) throw new Error('recuperación supera el presupuesto');
    paths.add(entry.path); files.push({ path: entry.path, bytes });
  }
  // Authenticate and validate the complete archive before creating any cleartext file.
  const root = await stat(dir);
  if (root && (!root.isDirectory() || root.isSymbolicLink())) throw new Error('directorio de recuperación inválido');
  for (const { path } of files) {
    const folder = await stat(join(dir, path.split('/')[0]));
    if (folder && (!folder.isDirectory() || folder.isSymbolicLink())) throw new Error('carpeta de recuperación no regular');
    const target = await stat(join(dir, path));
    if (target && (!target.isFile() || target.isSymbolicLink())) throw new Error('archivo de recuperación no regular');
  }
  for (const { path, bytes } of files) await atomic(join(dir, path), bytes);
  return { restored: true, count: files.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const mode = process.argv[2];
    if (!['--save', '--restore'].includes(mode)) throw new Error('usar --save o --restore');
    console.log(JSON.stringify(await (mode === '--save' ? saveRecovery() : restoreRecovery())));
  } catch (error) { console.error(String(error.message)); process.exitCode = 1; }
}
