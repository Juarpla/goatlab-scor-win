import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRenderer } from '../video-render/render/index.mjs';

test('renderers implement the swappable interface', () => {
  const renderer = getRenderer('remotion');
  assert.equal(renderer.name, 'remotion');
  for (const method of ['props', 'materialize', 'render']) {
    assert.equal(typeof renderer[method], 'function', method);
  }
  assert.throws(() => getRenderer('missing'), /renderer desconocido: missing/);
});

test('remotion materializes only its own assets', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'goatlab-renderer-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  getRenderer('remotion').materialize(tmp);
  assert.ok(existsSync(join(tmp, 'LiberationSans-Bold.ttf')));
  assert.ok(existsSync(join(tmp, 'brand.svg')));
});
