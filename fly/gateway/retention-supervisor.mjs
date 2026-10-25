// Own the complete runtime process group. Never purge while an OpenClaw worker
// can write: it could resurrect expired content from its in-memory session.
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { sweep } from './conversation-retention.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function supervise({ root = process.env.OPENCLAW_STATE_DIR || '/data',
  runtime = join(dirname(fileURLToPath(import.meta.url)), 'runtime.mjs'),
  workspaces = ['/home/node/.openclaw/workspace', '/data/workspace'],
  graceMs = 30_000, scanMs = 30_000, pollMs = 1000, signal, log = console.log } = {}) {
  const options = { root, workspaces };
  let child, closing = false;
  const signalGroup = kind => {
    if (!child?.pid) return;
    try { process.kill(-child.pid, kind); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  async function stopRuntime(grace) {
    const current = child;
    if (!current) return;
    const exited = !current.pid || current.exitCode !== null || current.signalCode !== null
      ? Promise.resolve() : new Promise(resolve => current.once('exit', resolve));
    signalGroup('SIGTERM');
    const timeout = new AbortController();
    await Promise.race([exited, delay(Math.max(0, grace), undefined, { signal: timeout.signal }).catch(() => {})]);
    timeout.abort();
    // Includes grandchildren that ignored graceful stop. Before opening SQLite
    // the sweep also verifies /proc has no other native storage owner.
    signalGroup('SIGKILL');
    await exited;
    for (let attempt = 0; current.pid; attempt++) {
      try { process.kill(-current.pid, 0); }
      catch (error) { if (error.code === 'ESRCH') break; throw error; }
      if (attempt >= 200) throw new Error('runtime process group did not stop');
      await delay(10);
    }
    child = undefined;
  }
  const close = () => { closing = true; signalGroup('SIGTERM'); };
  signal?.addEventListener('abort', close);
  try {
    while (!closing && !signal?.aborted) {
      const cleaned = sweep({ ...options, exclusive: true });
      log(`[retention] offline sweep ${JSON.stringify(cleaned)}`);
      if (closing) break;
      child = spawn(process.execPath, [runtime], {
        detached: true, stdio: 'inherit', env: { ...process.env, GOATLAB_IDLE_STOP_ENABLED: '0' },
      });
      let failed = false;
      child.on('error', () => { failed = true; });
      child.on('exit', () => { failed = true; });
      let deadline = cleaned.nextExpiry, nextScan = 0;
      while (!closing && !failed) {
        const now = Date.now();
        if (deadline !== null && now >= deadline - graceMs) break;
        if (now >= nextScan) {
          const plan = sweep({ ...options, dryRun: true });
          deadline = plan.expiredConversations ? now : plan.nextExpiry;
          nextScan = now + scanMs;
        }
        await delay(Math.max(1, Math.min(pollMs, deadline === null ? pollMs : deadline - graceMs - Date.now())));
      }
      if (closing || failed) {
        await stopRuntime(Math.min(25_000, graceMs));
        if (failed && !closing) throw new Error('gateway runtime failed');
        break;
      }
      log('[retention] stopping runtime for conversation expiry');
      await stopRuntime(Math.max(0, Math.min(25_000, deadline - Date.now())));
      while (!closing && Date.now() < deadline) await delay(Math.min(pollMs, deadline - Date.now()));
    }
  } finally {
    signal?.removeEventListener('abort', close);
    await stopRuntime(0);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  for (const kind of ['SIGTERM', 'SIGINT']) process.on(kind, () => controller.abort());
  try { await supervise({ signal: controller.signal }); }
  catch (error) { console.error(`[retention] unavailable: ${error.message}`); process.exitCode = 1; }
}
