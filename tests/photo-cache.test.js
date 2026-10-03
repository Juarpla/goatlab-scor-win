import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cachedPhoto, imageDimensions } from '../fly/render/photo-cache.mjs';

test('real image normalization preserves native dimensions and deduplicates concurrent downloads', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'goatlab-photos-'));
  try {
    const source = join(dir, 'source.png');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=736x1312', '-frames:v', '1', source]);
    const bytes = readFileSync(source); let calls = 0;
    const fetchImpl = async () => { calls++; return new Response(bytes); };
    const asset = { url: 'https://example.test/native.png' };
    const results = await Promise.all(Array.from({ length: 4 }, () => cachedPhoto(asset, dir, { fetchImpl })));
    assert.equal(calls, 1);
    assert.equal(results[0].width, 736);
    assert.equal(results[0].height, 1312);
    assert.deepEqual(await imageDimensions(results[0].backdrop), { width: 270, height: 480 });
    assert.equal((await cachedPhoto(asset, dir, { fetchImpl })).cached, true);
    assert.equal(calls, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cache cleanup respects active photos, removes unused files and stays within budget', async t => {
  const { writeFileSync, existsSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const { prunePhotoCache, pinPhotos } = await import('../fly/render/photo-cache.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'goatlab-cache-budget-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const asset = { url: 'https://example.test/active' };
  const file = join(dir, createHash('sha256').update(asset.url).digest('hex')+'.jpg');
  writeFileSync(file, Buffer.alloc(32)); writeFileSync(join(dir,'unused.jpg'),Buffer.alloc(32));
  const unpin = pinPhotos([asset]);
  assert.equal(prunePhotoCache(dir,{maxBytes:32,purgeUnused:true}),32);
  assert.ok(existsSync(file));
  unpin(); assert.equal(prunePhotoCache(dir,{purgeUnused:true}),0);
});
