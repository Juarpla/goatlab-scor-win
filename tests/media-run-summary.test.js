import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('GitHub summary reports ready totals and only certifies the requested mode', async t => {
  const repo = await mkdtemp(join(tmpdir(), 'goatlab-summary-'));
  t.after(() => rm(repo, { recursive: true, force: true }));
  await mkdir(join(repo, '.cache'));
  const results = [
    { matchId: 'missing', images: 0, clips: 0, mode: 'all', failures: [] },
    { matchId: 'mixed', images: 4, clips: 2, mode: 'all', failures: [] },
    { matchId: 'photos', images: 4, clips: 0, mode: 'images-only', failures: [] },
    { matchId: 'clips', images: 1, clips: 2, mode: 'clips-only', failures: [] },
    { matchId: 'upload-failed', images: 3, clips: 1, mode: 'all', failures: ['Motion Prompts no disponibles; montaje local disponible', 'R2: subida sin confirmar api-secret'] },
  ];
  await writeFile(join(repo, '.cache/media-run.json'), JSON.stringify({ mode: 'all', pending: 2, results }));
  const summaryPath = join(repo, 'summary.md');
  const result = spawnSync(process.execPath, [resolve('scripts/media-run-summary.mjs')], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath, AGNES_API_KEY: 'api-secret' },
  });
  assert.equal(result.status, 0, result.stderr);
  const summary = await readFile(summaryPath, 'utf8');
  const row = id => summary.split('\n').find(line => line.startsWith(`| ${id} |`));
  assert.match(row('missing'), /Recursos incompletos; causa no registrada/);
  assert.doesNotMatch(row('missing'), /Verificado/);
  assert.match(row('mixed'), /4\/4 imágenes listas; faltan 0/);
  assert.match(row('mixed'), /2\/2 clips listos; faltan 0/);
  for (const id of ['mixed', 'photos', 'clips']) assert.match(row(id), /Verificado/);
  assert.match(row('upload-failed'), /3\/4 imágenes listas; faltan 1/);
  assert.match(row('upload-failed'), /R2: subida sin confirmar/);
  assert.doesNotMatch(summary, /api-secret/);
  const persisted = JSON.parse(await readFile(join(repo, '.cache/media-run.json'), 'utf8'));
  assert.deepEqual(persisted.results, results);
});
