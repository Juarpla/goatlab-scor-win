// Supervisor de apagado elegante para goatlab-gateway (F5b).
// Triple señal de ocupado: /data/.busy + sessions.list + uptime mínimo.
// Pre-apagado: setWebhook (re-registrar por si OpenClaw lo limpia) +
// POST /machines/<id>/stop vía Fly Machines API.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CHECK_MS = 60_000;
const MIN_UPTIME_MS = 10 * 60_000;
const IDLE_MS = 15 * 60_000;
const BUSY_FILE = '/data/.busy';
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const FLY_TOKEN = process.env.FLY_API_TOKEN;
const APP = process.env.FLY_APP_NAME ?? 'goatlab-gateway';
const MACHINE_ID = process.env.FLY_MACHINE_ID;
const WEBHOOK_URL = 'https://goatlab-gateway.fly.dev/telegram-webhook';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const start = Date.now();
let lastActivity = Date.now();

async function busyReason() {
  if (existsSync(BUSY_FILE)) return '/data/.busy presente (render en vuelo)';
  try {
    const { stdout } = await run('openclaw', ['sessions', '--json', '--limit', '5'], { timeout: 15_000 });
    const data = JSON.parse(stdout);
    for (const s of data.sessions ?? []) {
      if (s.status === 'active' || s.status === 'running') return `sesión ${s.key} en estado ${s.status}`;
      if (s.updatedAt && Date.now() - s.updatedAt < IDLE_MS)
        return `sesión ${s.key} actualizada hace ${Math.round((Date.now() - s.updatedAt) / 60000)}min`;
    }
  } catch (e) {
    return `sessions.list falló: ${String(e.message ?? e).slice(0, 120)}`;
  }
  if (Date.now() - start < MIN_UPTIME_MS) return 'uptime mínimo (10min) no cumplido';
  return null;
}

async function setWebhook() {
  const r = await fetch(`https://api.telegram.org/bot${BOT}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: WEBHOOK_URL, secret_token: WEBHOOK_SECRET }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`setWebhook: ${j.description}`);
}

async function verifyWebhook() {
  const r = await fetch(`https://api.telegram.org/bot${BOT}/getWebhookInfo`);
  const j = await r.json();
  return j.ok && j.result.url === WEBHOOK_URL;
}

async function stopMachine() {
  const r = await fetch(`https://api.machines.dev/v1/apps/${APP}/machines/${MACHINE_ID}/stop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FLY_TOKEN}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!r.ok) throw new Error(`machines stop: ${r.status} ${await r.text()}`);
}

let checks = 0;

async function check() {
  checks++;
  const reason = await busyReason();
  if (reason) {
    lastActivity = Date.now();
    if (checks % 5 === 1) console.log(`idle-stop: ocupado (${reason})`);
    return;
  }
  if (Date.now() - lastActivity < IDLE_MS) return;
  console.log('idle-stop: 15 min sin actividad, apagando…');
  try {
    await setWebhook();
    if (!(await verifyWebhook())) throw new Error('webhook no verificado tras setWebhook');
    // Gate final: algo pudo llegar durante el setWebhook (~5-10s). Si hay
    // actividad nueva, abortar el apagado en vez de cortar trabajo entrante.
    const late = await busyReason();
    if (late) {
      console.log(`idle-stop: apagado abortado (${late})`);
      lastActivity = Date.now();
      return;
    }
    await stopMachine();
    console.log('idle-stop: máquina apagada');
  } catch (e) {
    console.error(`idle-stop: ${e.message}`);
    lastActivity = Date.now();
  }
}

setInterval(check, CHECK_MS);
console.log(`idle-stop: supervisor activo (check ${CHECK_MS / 1000}s, idle ${IDLE_MS / 60000}min)`);
