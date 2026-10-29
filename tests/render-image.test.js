import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('Render image includes the dependencies needed to load its media bank', t => {
  const root = mkdtempSync(join(tmpdir(), 'goatlab-render-image-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const target = join(root, 'src/lib');
  mkdirSync(target, { recursive: true });
  const dockerfile = readFileSync(new URL('../fly/render/Dockerfile', import.meta.url), 'utf8');
  const sources = dockerfile.split('\n')
    .filter(line => line.startsWith('COPY ') && line.endsWith(' ./src/lib/'))
    .flatMap(line => line.split(/\s+/).slice(1, -1));
  for (const source of sources) {
    copyFileSync(new URL(`../${source}`, import.meta.url), join(target, basename(source)));
  }
  const result = execFileSync(process.execPath, ['--input-type=module', '-e',
    'const { CLIPS_PER_MATCH } = await import("./src/lib/media.js"); console.log(CLIPS_PER_MATCH);'],
  { cwd: root, encoding: 'utf8' });
  assert.equal(Number(result.trim()), 4);
});
