// Supervisor de apagado elegante para goatlab-gateway (F5b).
// Ventana ÚNICA de 10 min: apaga cuando la sesión más reciente lleva >10 min
// quieta, sin .busy, sin turno activo y con uptime ≥10 min.
// Pre-apagado: setWebhook (re-registrar por si OpenClaw lo limpia) +
// POST /machines/<id>/stop vía Fly Machines API.
import { prepareNativeStop, resumeNativeStop } from './idle-safety.mjs';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CHECK_MS = 60_000;
const MIN_UPTIME_MS = 10 * 60_000;
const IDLE_MS = 10 * 60_000; // 10 min quieta la sesión más reciente
const BUSY_FILE = '/data/.busy';
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const FLY_TOKEN = process.env.FLY_API_TOKEN;
const APP = process.env.FLY_APP_NAME ?? 'goatlab-gateway';
const MACHINE_ID = process.env.FLY_MACHINE_ID;
const WEBHOOK_URL = process.env.TELEGRAM_PUBLIC_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const start = Date.now();
const control = async (path, method = 'GET') => {
  const r = await fetch(`http://127.0.0.1:4004${path}`, {
    method, headers: { Authorization: `Bearer ${WEBHOOK_SECRET}` },
    ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error('control de acceso no disponible');
  return r.json();
};

async function busyReason() {
  if (Date.now() - start < MIN_UPTIME_MS) return 'uptime mínimo (10min) no cumplido';
  if (existsSync(BUSY_FILE)) return '/data/.busy presente (render en vuelo)';
  try {
    const { lastActivity } = await control('/state');
    if (!Number.isFinite(lastActivity) || Date.now() - lastActivity < IDLE_MS) return 'interacción reciente en Telegram o UI';
  } catch { return 'control de actividad no disponible'; }
  try {
    const { stdout } = await run('python3', [`${process.env.GOATLAB_SKILL_DIR}/scripts/workflow.py`, 'busy'], { timeout: 10_000 });
    if (JSON.parse(stdout).busy) return 'tareas del flujo pendientes';
  } catch {
    return 'supervisor del flujo no disponible';
  }
  try {
    if (readdirSync('/data/media-pack').some(name => name.endsWith('.running'))) {
      return 'generación de imágenes en curso';
    }
  } catch { /* sin directorio: no hay búsqueda */ }
  return null;
}

async function setWebhook() {
  if (!WEBHOOK_URL) throw new Error('falta TELEGRAM_PUBLIC_WEBHOOK_URL');
  const r = await fetch(`https://api.telegram.org/bot${BOT}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: WEBHOOK_URL, secret_token: WEBHOOK_SECRET }), signal: AbortSignal.timeout(10_000),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`setWebhook: ${j.description}`);
}

async function verifyWebhook() {
  const r = await fetch(`https://api.telegram.org/bot${BOT}/getWebhookInfo`, { signal: AbortSignal.timeout(10_000) });
  const j = await r.json();
  return j.ok && j.result.url === WEBHOOK_URL;
}

async function stopMachine() {
  const r = await fetch(`https://api.machines.dev/v1/apps/${APP}/machines/${MACHINE_ID}/stop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FLY_TOKEN}`, 'Content-Type': 'application/json' },
    body: '{}', signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`machines stop: ${r.status} ${await r.text()}`);
}

let checks = 0;

async function check() {
  checks++;
  const reason = await busyReason();
  if (reason) {
    if (checks % 5 === 1) console.log(`idle-stop: ocupado (${reason})`);
    return;
  }
  console.log('idle-stop: 10 min sin actividad, apagando…');
  let suspensionId;
  try {
    await setWebhook();
    if (!(await verifyWebhook())) throw new Error('webhook no verificado tras setWebhook');
    if (await busyReason()) return; // activity may have arrived during network calls
    suspensionId = await prepareNativeStop();
    if (!suspensionId) return;
    if (await busyReason()) { await resumeNativeStop(suspensionId); return; }
    await control('/revoke', 'POST');
    await stopMachine();
    console.log('idle-stop: máquina apagada');
  } catch (e) {
    if (suspensionId) await resumeNativeStop(suspensionId).catch(() => {});
    await control('/resume', 'POST').catch(() => {});
    console.error('idle-stop: apagado pendiente; se volverá a intentar');
  }
}

setInterval(check, CHECK_MS);
console.log(`idle-stop: supervisor activo (check ${CHECK_MS / 1000}s, idle ${IDLE_MS / 60000}min)`);
