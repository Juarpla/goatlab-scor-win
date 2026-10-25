import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run the real supervisor with executable fixtures in place of container services.
// A live child which never opens the Gateway port must not leave Fly unhealthy forever.
async function runtime(t, mode, startupTimeout = '3000') {
  const dir = await mkdtemp(join(tmpdir(), 'goatlab-runtime-'));
  const executable = join(dir, 'node');
  await writeFile(executable, `#!${process.execPath}
import { createServer } from 'node:http';
const args = process.argv.slice(2);
if (args.includes('gateway')) {
  console.log('fixture: gateway started');
  if (process.env.FIXTURE_MODE === 'exit') process.exit(7);
  if (['ready', 'pending', 'service-exit'].includes(process.env.FIXTURE_MODE)) {
    const started = Date.now();
    setTimeout(() => createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      const ready = process.env.FIXTURE_MODE !== 'pending' && Date.now() - started >= 600;
      if (req.url === '/healthz') return res.end(JSON.stringify({ ok: true }));
      if (req.url !== '/startupz') { res.statusCode = 404; return res.end('{}'); }
      res.statusCode = ready ? 200 : 503;
      if (ready) console.log('fixture: startup ready');
      res.end(JSON.stringify({ ok: ready, status: ready ? 'started' : 'starting' }));
    }).listen(3001, '127.0.0.1'), 100);
  }
} else {
  console.log('fixture: service ' + args[0]);
  if (process.env.FIXTURE_MODE === 'service-exit' && args.includes('supervise')) process.exit(9);
}
setInterval(() => {}, 1000);
`);
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  await chmod(executable, 0o755);
  for (const name of ['nginx', 'python3']) {
    await writeFile(join(dir, name), await readFile(executable));
    await chmod(join(dir, name), 0o755);
  }
  const child = spawn(process.execPath, [fileURLToPath(new URL('../fly/gateway/runtime.mjs', import.meta.url))], {
    env: { PATH: `${dir}:${process.env.PATH}`, FIXTURE_MODE: mode,
      GOATLAB_SKILL_DIR: dir, GOATLAB_GATEWAY_STARTUP_TIMEOUT_MS: startupTimeout },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', b => { output += b; });
  child.stderr.on('data', b => { output += b; });
  const exited = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
    await rm(dir, { recursive: true, force: true });
  });
  return { child, exited, output: () => output };
}

async function waitFor(app, pattern) {
  for (let n = 0; n < 200; n++) {
    if (pattern.test(app.output())) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.match(app.output(), pattern);
}

test('a Gateway that never listens fails startup instead of running forever', { timeout: 8000 }, async t => {
  const app = await runtime(t, 'stuck');
  const result = await Promise.race([
    app.exited,
    new Promise(resolve => { const timer = setTimeout(() => resolve('still running without port 3001'), 6000); timer.unref(); }),
  ]);
  assert.notEqual(result, 'still running without port 3001');
  assert.equal(result[0], 1);
  assert.match(app.output(), /startup timed out.*3001/);
  assert.doesNotMatch(app.output(), /fixture: service .*workflow.py/);
});

test('liveness alone cannot start queued work while startup is pending', { timeout: 8000 }, async t => {
  const app = await runtime(t, 'pending');
  const [code] = await app.exited;
  assert.equal(code, 1);
  assert.match(app.output(), /startup timed out.*HTTP 503/);
  assert.doesNotMatch(app.output(), /fixture: service .*workflow.py|fixture: service .*idle-stop/);
});

test('workflow and idle clock start after OpenClaw finishes startup', { timeout: 8000 }, async t => {
  const app = await runtime(t, 'ready');
  await waitFor(app, /fixture: service .*idle-stop/);
  await waitFor(app, /fixture: service .*workflow.py/);
  const output = app.output();
  assert.match(output, /gateway startup complete/);
  assert(output.indexOf('fixture: startup ready') < output.indexOf('fixture: service ' + '/home/node/idle-stop.mjs'));
  assert(output.indexOf('fixture: startup ready') < output.indexOf('/scripts/workflow.py'));
  app.child.kill('SIGTERM');
  assert.equal((await app.exited)[0], 0);
});

test('an early Gateway exit is reported and stops its siblings', { timeout: 8000 }, async t => {
  const app = await runtime(t, 'exit');
  assert.equal((await app.exited)[0], 1);
  assert.match(app.output(), /gateway exited code=7/);
  assert.doesNotMatch(app.output(), /fixture: service .*workflow.py/);
});

test('a workflow failure still destroys the entire lifecycle', { timeout: 8000 }, async t => {
  const app = await runtime(t, 'service-exit');
  assert.equal((await app.exited)[0], 1);
  assert.match(app.output(), /workflow exited code=9/);
  assert.match(app.output(), /gateway exited code=null signal=SIGTERM/);
});

test('shutdown during startup cancels readiness and never starts workflow', { timeout: 8000 }, async t => {
  const app = await runtime(t, 'stuck');
  await waitFor(app, /fixture: gateway started/);
  app.child.kill('SIGTERM');
  assert.equal((await app.exited)[0], 0);
  assert.doesNotMatch(app.output(), /startup timed out|fixture: service .*workflow.py/);
});

test('production can observe a slow startup without restarting the Gateway', { timeout: 8000 }, async t => {
  const app = await runtime(t, 'stuck', '0');
  await waitFor(app, /fixture: gateway started/);
  await new Promise(resolve => setTimeout(resolve, 1600));
  assert.equal(app.child.exitCode, null);
  assert.match(app.output(), /waiting for gateway/);
  assert.doesNotMatch(app.output(), /startup timed out|fixture: service .*workflow.py/);
  app.child.kill('SIGTERM');
  assert.equal((await app.exited)[0], 0);
});
