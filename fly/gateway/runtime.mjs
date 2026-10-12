// One lifecycle: a failed/restarted Gateway must destroy all UI credentials.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const env = { ...process.env,
  OPENCLAW_GATEWAY_PASSWORD: process.env.OPENCLAW_GATEWAY_PASSWORD || process.env.OPENCLAW_GATEWAY_TOKEN || randomBytes(32).toString('hex'),
};
delete env.OPENCLAW_GATEWAY_TOKEN; // trusted-proxy rejects a shared token.
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return; stopping = true;
  for (const child of children) child.kill('SIGTERM');
  const timer = setTimeout(() => { for (const child of children) child.kill('SIGKILL'); process.exit(code); }, 25_000);
  Promise.all(children.map(child => child.exitCode !== null ? Promise.resolve() : new Promise(r => child.once('exit', r))))
    .then(() => { clearTimeout(timer); process.exit(code); });
}
for (const [command, args] of [
  ['nginx', ['-g', 'daemon off;']],
  ['node', ['dist/index.js', 'gateway', '--port', '3001', '--bind', 'loopback']],
  ['node', ['/home/node/ui-access.mjs']],
  ['python3', [`${env.GOATLAB_SKILL_DIR}/scripts/workflow.py`, 'supervise']],
  ['node', ['/home/node/idle-stop.mjs']],
]) {
  const child = spawn(command, args, { env, stdio: 'inherit' }); children.push(child);
  child.once('error', () => stop(1)); child.once('exit', () => { if (!stopping) stop(1); });
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stop(0));
