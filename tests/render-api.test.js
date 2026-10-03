import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

test('HTTP cancellation survives process restart and duplicate POST cannot start a render', async t => {
  const state = mkdtempSync(join(tmpdir(), 'goatlab-api-'));
  t.after(() => rmSync(state, { recursive: true, force: true }));
  async function start() {
    const process = spawn(globalThis.process.execPath, [resolve('fly/render/server.mjs')], { env: { ...globalThis.process.env, PORT: '0', TELEGRAM_BOT_TOKEN: 'offline-test', RENDER_SECRET: 'secret', RENDER_STATE_DIR: state, PHOTO_CACHE_DIR: join(state, 'cache') }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    process.stderr.on('data', b => { errors += b; });
    const url = await new Promise((accept, reject) => {
      const timer = setTimeout(() => { process.kill(); reject(new Error(`startup timeout: ${errors}`)); }, 5000);
      process.stdout.on('data', b => { output += b; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); accept(`http://127.0.0.1:${match[1]}`); } });
      process.once('exit', code => { clearTimeout(timer); reject(new Error(`startup ${code}: ${errors}`)); });
    });
    return { url, async stop() { const exited = once(process, 'exit'); process.kill(); await exited; } };
  }
  const body = { expiresAt: Date.now()+3600_000, requestId: 'stable-cancelled', chatId: '1', matchId: 'a-b', matchLabel: 'A contra B', hook: 'Gancho', audioFileId: 'telegram_valid_voice_id', assets: [{ url: 'https://example.test/0.jpg' }, { url: 'https://example.test/1.jpg' }] };
  const send = (app, path, value, authorized = true) => fetch(app.url + path, { method: value ? 'POST' : 'GET', headers: authorized ? { authorization: 'Bearer secret', 'content-type': 'application/json' } : {}, body: value ? JSON.stringify(value) : undefined });
  let app = await start();
  try {
    assert.equal((await send(app, '/render', body, false)).status, 401);
    assert.deepEqual(await (await send(app, '/render/cancel', body)).json(), { cancelled: true });
  } finally { await app.stop(); }
  app = await start();
  try {
    const response = await send(app, '/render', body);
    assert.equal(response.status, 202);
    const job = await response.json();
    assert.equal(job.status, 'cancelled'); assert.equal(job.duplicate, true);
    assert.equal((await send(app, `/jobs/${job.jobId}`, undefined, false)).status, 401);
    assert.equal((await (await send(app, `/jobs/${job.jobId}`)).json()).status, 'cancelled');
    assert.equal((await send(app, '/render', { ...body, variant: 10 })).status, 400);
    assert.equal((await send(app, '/render', { ...body, mediaMinimum: 8 })).status,400);
    assert.equal((await send(app, '/render', { ...body, facts: [{id:'fake',value:3}] })).status,400);
    assert.equal((await send(app, '/render', { ...body, expiresAt: Date.now()-1 })).status, 410);
    assert.equal((await send(app, '/render', { ...body, expiresAt: undefined })).status, 400);
    assert.equal((await send(app, '/render', { ...body, chatId: 'telegram:1' })).status,400);
    assert.equal((await send(app, '/render', { ...body, audioFileId: '/workspace/voice.ogg' })).status,400);
  } finally { await app.stop(); }
});
