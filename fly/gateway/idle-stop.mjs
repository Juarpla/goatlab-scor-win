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

async function isBusy() {
  if (existsSync(BUSY_FILE)) return true;
  try {
    const { stdout } = await run('openclaw', ['sessions', '--json', '--limit', '5'], { timeout: 15_000 });
    const data = JSON.parse(stdout);
    for (const s of data.sessions ?? []) {
      if (s.status === 'active' || s.status === 'running') return true;
      if (s.updatedAt && Date.now() - s.updatedAt < IDLE_MS) return true;
    }
  } catch {
    return true;
  }
  if (Date.now() - start < MIN_UPTIME_MS) return true;
  return false;
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

async function check() {
  if (await isBusy()) {
    lastActivity = Date.now();
    return;
  }
  if (Date.now() - lastActivity < IDLE_MS) return;
  console.log('idle-stop: 15 min sin actividad, apagando…');
  try {
    await setWebhook();
    if (!(await verifyWebhook())) throw new Error('webhook no verificado tras setWebhook');
    await stopMachine();
    console.log('idle-stop: máquina apagada');
  } catch (e) {
    console.error(`idle-stop: ${e.message}`);
    lastActivity = Date.now();
  }
}

setInterval(check, CHECK_MS);
console.log(`idle-stop: supervisor activo (check ${CHECK_MS / 1000}s, idle ${IDLE_MS / 60000}min)`);
