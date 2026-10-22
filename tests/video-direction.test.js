import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAuthoredPlan } from '../fly/render/authored-composition.mjs';
import { JobStore } from '../fly/render/job-store.mjs';
import { submitPlan } from '../fly/render/creative-job.mjs';
import { telegramCaption, telegramCaptionDetails } from '../src/lib/youtube.js';
import { VISUAL_STYLES } from '../src/lib/visual-style.js';
import { remember, designMemory, directVideo } from '../fly/gateway/creative-director.mjs';
import { styleReport } from '../scripts/report-video-styles.mjs';
import { recordRenderStart, recordRenderProgress } from '../fly/render/render-metrics.mjs';

const plan = { version: 5, code: 'export default () => null', scenes: [{ start: 0, end: 1 }] };
const directory = t => { const dir = mkdtempSync(join(tmpdir(), 'goatlab-direction-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };

test('new style and cinematic imports are validated while existing plans stay valid', () => {
  validateAuthoredPlan(plan, 90);
  for (const visualStyle of Object.keys(VISUAL_STYLES)) validateAuthoredPlan({ ...plan, visualStyle }, 90);
  for (const visualStyle of ['unknown', 'editorial|documentary|trailer', '__proto__', null, 1]) assert.throws(() => validateAuthoredPlan({ ...plan, visualStyle }, 90), /visualStyle/);
  validateAuthoredPlan({ ...plan, code: "import {CameraMove,ColorWash,FilmGrain} from 'goatlab-kit';export default () => null" }, 90);
});

test('a newly generated plan without a direction fails before a capture is submitted', async t => {
  const calls = [], now = Date.now();
  const result = await directVideo({ requestId: 'missing-style', expiresAt: now + 10000 }, {
    directory: directory(t),
    worker: async (path, body) => {
      calls.push(path);
      if (path === '/render') return { jobId: 'job-test' };
      if (path.endsWith('/context')) return { generation: 1, photos: [], source: {} };
      if (path === '/render/fail') return {};
      return { status: 'awaiting-plan', prepared: true, attempts: 1, revision: 0, expiresAt: now + 10000 };
    },
    decide: async () => ({ plan, notes: 'Composición original' }),
  });
  assert.equal(result.status, 'error');
  assert.equal(calls.includes('/render/plan'), false);
});

test('style survives submit, release and restart, and old jobs receive no invented classification', t => {
  const dir = directory(t), store = new JobStore(dir);
  const { job } = store.accept({ requestId: 'a', chatId: '1', matchId: 'a-b', workflowProtocol: 3, assets: [] });
  Object.assign(job, { prepared: true, revision: 0, status: 'awaiting-plan' });
  submitPlan(job, { generation: 1, baseRevision: 0, plan: { ...plan, visualStyle: 'documentary' } }, () => {});
  assert.equal(job.visualStyle, 'documentary');
  job.status = 'done'; store.release(job);
  assert.equal(new JobStore(dir).jobs.get(job.id).visualStyle, 'documentary');
  assert.equal(job.plan, undefined);
  assert.match(telegramCaption(job), /Dirección visual: Documental deportivo/);
  assert.equal(telegramCaption({ title: 'Original' }), 'Original');
  for (const [visualStyle, label] of Object.entries(VISUAL_STYLES)) {
    const caption = telegramCaption({ visualStyle, title: 'x'.repeat(3000), musicCredit: 'créditos '.repeat(300) });
    assert.ok(caption.length <= 1024);
    assert.ok(caption.startsWith('Dirección visual: ' + label));
  }
});

test('preferences retain style with earlier votes and report only the next six samples', t => {
  const root = directory(t);
  remember(root, '7', { requestId: 'early-vote', rating: -1, reason: 'demasiado rápido' });
  remember(root, '7', { requestId: 'early-vote', at: 100, visualStyle: 'trailer', concept: 'Cortes por frase', metrics: { captureMs: 1000 } });
  for (let i = 0; i < 7; i++) remember(root, '7', { requestId: 'sample-' + i, at: 101 + i, visualStyle: 'documentary', concept: 'Encuadres sostenidos', metrics: { captureMs: 2000 }, rating: i % 2 ? 1 : undefined });
  const memory = designMemory(root, root, '7', 'current');
  assert.equal(memory.disliked[0].visualStyle, 'trailer');
  assert.equal(memory.disliked[0].reason, 'demasiado rápido');
  const report = styleReport(JSON.parse(readFileSync(join(root, '7.json'), 'utf8')), { since: 100 });
  assert.equal(report.samples, 6); assert.equal(report.pending, 0);
  assert.equal(report.styles.find(s => s.visualStyle === 'trailer').disliked, 1);
  assert.equal(report.styles.find(s => s.visualStyle === 'documentary').samples, 5);
  assert.equal(report.styles.find(s => s.visualStyle === 'documentary').captureMedianMs, 2000);
  assert.equal(report.styles.find(s => s.visualStyle === 'editorial').captureMedianMs, null);
  assert.equal(styleReport({ items: [] }).pending, 6);
});

test('render progress preserves independent overlapping completion times and effective concurrency', () => {
  const metrics = { captureMs: 1200, renderedDoneIn: null, encodedDoneIn: null };
  recordRenderStart(metrics, { resolvedConcurrency: 2, parallelEncoding: true });
  recordRenderProgress(metrics, { renderedDoneIn: 1000, encodedDoneIn: null });
  recordRenderProgress(metrics, { renderedDoneIn: null, encodedDoneIn: 1100 });
  assert.deepEqual(metrics, { captureMs: 1200, renderedDoneIn: 1000, encodedDoneIn: 1100, resolvedConcurrency: 2, parallelEncoding: true });
});


test('style labels preserve the decision to attach full credits at the caption boundary', () => {
  const input = { title: 'Título', hook: 'Gancho', attribution: 'c'.repeat(990) };
  assert.equal(telegramCaptionDetails(input).creditsOverflow, false);
  const styled = telegramCaptionDetails({ ...input, visualStyle: 'documentary' });
  assert.equal(styled.creditsOverflow, true);
  assert.match(styled.caption, /Créditos completos en el archivo adjunto/);
  assert.ok(styled.caption.length <= 1024);
});
