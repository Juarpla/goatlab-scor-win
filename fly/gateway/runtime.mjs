// One lifecycle: a failed/restarted Gateway must destroy all UI credentials.
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// A cold volume can need several minutes. Restart deadlines require an explicit
// measured budget; production defaults to observing startup without interrupting it.
const startupTimeoutMs = Number(process.env.GOATLAB_GATEWAY_STARTUP_TIMEOUT_MS ?? 0);
if (!Number.isFinite(startupTimeoutMs) || startupTimeoutMs < 0) {
  console.error('[runtime] invalid GOATLAB_GATEWAY_STARTUP_TIMEOUT_MS');
  process.exit(1);
}
const env = { ...process.env,
  GOATLAB_GATEWAY_INSTANCE: randomUUID(),
  OPENCLAW_GATEWAY_PASSWORD: process.env.OPENCLAW_GATEWAY_PASSWORD || process.env.OPENCLAW_GATEWAY_TOKEN || randomBytes(32).toString('hex'),
};
delete env.OPENCLAW_GATEWAY_TOKEN; // trusted-proxy rejects a shared token.
const children = [];
let stopping = false;
const startup = new AbortController();
let startupTimer;
function stop(code = 0) {
  if (stopping) return; stopping = true;
  clearTimeout(startupTimer);
  startup.abort();
  const exited = children.map(child => child.exitCode !== null || child.signalCode !== null || !child.pid
    ? Promise.resolve() : new Promise(r => child.once('exit', r)));
  for (const child of children) child.kill('SIGTERM');
  const timer = setTimeout(() => { for (const child of children) child.kill('SIGKILL'); process.exit(code); }, 25_000);
  Promise.all(exited)
    .then(() => { clearTimeout(timer); process.exit(code); });
}
function launch(name, command, args) {
  if (stopping) return;
  const child = spawn(command, args, { env, stdio: 'inherit' });
  children.push(child);
  console.log(`[runtime] started ${name} pid=${child.pid ?? 'unavailable'}`);
  child.once('error', error => {
    console.error(`[runtime] ${name} spawn failed (${error.code ?? 'unknown'})`);
    stop(1);
  });
  child.once('exit', (code, signal) => {
    console.log(`[runtime] ${name} exited code=${code} signal=${signal ?? 'none'}`);
    if (!stopping) stop(1);
  });
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stop(0));

async function start() {
  launch('nginx', 'nginx', ['-g', 'daemon off;']);
  // Use the image's public launcher, including its runtime/bootstrap checks.
  launch('gateway', 'node', ['/app/openclaw.mjs', 'gateway', '--port', '3001', '--bind', 'loopback']);
  launch('ui-access', 'node', ['/home/node/ui-access.mjs']);
  const started = Date.now();
  let lastStatus = 'no HTTP response', nextLog = 0;
  if (startupTimeoutMs > 0) startupTimer = setTimeout(() => {
    console.error(`[runtime] gateway startup timed out at 127.0.0.1:3001 after ${startupTimeoutMs}ms (${lastStatus})`);
    stop(1);
  }, startupTimeoutMs);
  while (!stopping) {
    try {
      const response = await fetch('http://127.0.0.1:3001/startupz', {
        signal: AbortSignal.any([startup.signal, AbortSignal.timeout(2000)]),
      });
      const state = await response.json();
      lastStatus = `HTTP ${response.status}`;
      if (response.ok && state.ok === true && state.status === 'started') {
        if (stopping) return;
        clearTimeout(startupTimer);
        console.log(`[runtime] gateway startup complete at 127.0.0.1:3001 after ${Date.now() - started}ms`);
        // Recover queued work and start the idle clock after OpenClaw finishes startup.
        launch('workflow', 'python3', [`${env.GOATLAB_SKILL_DIR}/scripts/workflow.py`, 'supervise']);
        if (env.GOATLAB_IDLE_STOP_ENABLED !== '0') launch('idle-stop', 'node', ['/home/node/idle-stop.mjs']);
        return;
      }
    } catch {
      lastStatus = 'no valid startup response';
    }
    if (Date.now() >= nextLog && !stopping) {
      console.log(`[runtime] waiting for gateway 127.0.0.1:3001 (${lastStatus}, elapsed=${Date.now() - started}ms)`);
      nextLog = Date.now() + 15_000;
    }
    await delay(500, undefined, { signal: startup.signal });
  }
}
start().catch(() => {
  if (!stopping) {
    console.error('[runtime] startup failed');
    stop(1);
  }
});
