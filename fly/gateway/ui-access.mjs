import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { isIP } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const run = promisify(execFile);
const hash = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const COOKIE = '__Host-openclaw';
const SCOPES = 'operator.read,operator.write,operator.approvals,operator.questions';
const ACTIVE_METHODS = new Set(['chat.send', 'chat.abort', 'exec.approval.resolve', 'questions.answer', 'sessions.reset']);

function reply(res, status, value, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 4096) throw new Error('body'); chunks.push(chunk); }
  return Buffer.concat(chunks).toString();
}

// Observe bounded masked client frames without altering the Gateway protocol.
// Compression is not negotiated upstream. Fragmented messages are bounded too.
export function activityFrames(onActivity) {
  let buffer = Buffer.alloc(0), fragments = [], fragmentBytes = 0;
  return chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 1_100_000) { buffer = Buffer.alloc(0); fragments = []; fragmentBytes = 0; return; }
    while (buffer.length >= 2) {
      const fin = !!(buffer[0] & 128), opcode = buffer[0] & 15, masked = !!(buffer[1] & 128);
      let size = buffer[1] & 127, offset = 2;
      if (size === 126) { if (buffer.length < 4) return; size = buffer.readUInt16BE(2); offset = 4; }
      if (size === 127) { if (buffer.length < 10) return; const n = buffer.readBigUInt64BE(2); if (n > 1_000_000n) { buffer = Buffer.alloc(0); return; } size = Number(n); offset = 10; }
      if (!masked || size > 1_000_000) { buffer = Buffer.alloc(0); return; }
      if (buffer.length < offset + 4 + size) return;
      const mask = buffer.subarray(offset, offset + 4); offset += 4;
      const payload = Buffer.from(buffer.subarray(offset, offset + size));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buffer = buffer.subarray(offset + size);
      if (opcode !== 1 && opcode !== 0) continue;
      if (opcode === 1) { fragments = []; fragmentBytes = 0; }
      fragmentBytes += payload.length;
      if (fragmentBytes > 1_000_000) { fragments = []; fragmentBytes = 0; continue; }
      fragments.push(payload);
      if (!fin) continue;
      try { const value = JSON.parse(Buffer.concat(fragments).toString()); if (value.type === 'req' && ACTIVE_METHODS.has(value.method)) onActivity(); } catch { /* non-RPC frame */ }
      fragments = []; fragmentBytes = 0;
    }
  };
}

export function createUiAccess({ origin, owner, controlSecret, upstream = 'http://127.0.0.1:3001',
  now = Date.now, reset, sendWelcome, lastEvent = -1, events = [], saveEvent = () => {}, idleMs = 600_000 } = {}) {
  const expected = new URL(origin);
  if (expected.protocol !== 'https:' || !/^\d+$/.test(owner ?? '') || !controlSecret) throw new Error('UI access configuration');
  let codeHash, pending, lastActivity = now(), epoch = 0, stopped = false, startTail = Promise.resolve();
  let recentEvents = events.length ? events : lastEvent >= 0 ? [{ event: lastEvent, at: now() }] : [];
  const sessions = new Map(), sockets = new Set(), requests = new Set(), attempts = new Map(), activityEvents = new Map();
  const touch = () => { lastActivity = now(); };
  function revoke() {
    epoch++; codeHash = undefined; pending = undefined; sessions.clear();
    for (const socket of sockets) socket.destroy(); sockets.clear();
    for (const request of requests) request.destroy(); requests.clear();
  }
  function authenticated(req) {
    if (stopped || !codeHash) return false;
    const cookie = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    return !!cookie && sessions.has(hash(cookie));
  }
  function clientIp(req) {
    const value = req.headers['x-goatlab-client-ip'];
    return typeof value === 'string' && isIP(value) && value !== '::1' && !value.startsWith('127.') && !value.startsWith('::ffff:127.') ? value : undefined;
  }
  function headers(req) {
    const allowed = ['accept', 'accept-language', 'content-type', 'content-length', 'user-agent',
      'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'upgrade', 'connection'];
    const result = Object.fromEntries(allowed.filter(k => req.headers[k] !== undefined).map(k => [k, req.headers[k]]));
    return { ...result, host: expected.host, origin: expected.origin,
      'x-forwarded-for': clientIp(req), 'x-forwarded-host': expected.host, 'x-forwarded-proto': 'https',
      'x-forwarded-user': `telegram:${owner}`, 'x-openclaw-scopes': SCOPES };
  }
  function validOrigin(req) { return req.headers.origin === expected.origin; }
  function targetUrl(req) {
    const target = new URL(req.url, upstream);
    if (!req.url.startsWith('/') || target.origin !== new URL(upstream).origin) throw new Error('target');
    return target;
  }
  async function start(value) {
    if (stopped || String(value.chat) !== owner || !Number.isSafeInteger(value.event) || value.event < 0) throw new Error('start');
    recentEvents = recentEvents.filter(item => now() - item.at < 24 * 60 * 60_000);
    if (recentEvents.some(item => item.event === value.event)) {
      if (pending?.event === value.event) { await sendWelcome(pending.chat, origin, pending.code); pending = undefined; }
      return { ok: true, duplicate: true };
    }
    await reset(value.chat);
    const nextEvents = [...recentEvents, { event: value.event, at: now() }];
    if (nextEvents.length > 10_000) throw new Error('event capacity');
    saveEvent(value.event, nextEvents); recentEvents = nextEvents;
    revoke(); touch();
    const code = randomBytes(24).toString('base64url'); codeHash = hash(code);
    pending = { event: value.event, chat: value.chat, code };
    await sendWelcome(value.chat, origin, code);
    pending = undefined;
    return { ok: true };
  }
  const server = createServer(async (req, res) => {
    try {
      if (!clientIp(req)) return reply(res, 403, { error: 'proxy required' });
      if (req.url === '/access' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", 'referrer-policy': 'no-referrer' });
        return res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OpenClaw</title><style>body{font:18px system-ui;max-width:32rem;margin:12vh auto;padding:1.5rem;background:#10151c;color:#f3f5f7}input,button{font:inherit;padding:.7rem;box-sizing:border-box;width:100%;margin:.6rem 0}button{cursor:pointer}label{display:block}</style><h1>OpenClaw</h1><p>Envía /start por Telegram y pega aquí el código que recibas.</p><form action="/access" method="post"><label>Código de acceso<input name="code" type="password" required autocomplete="off" maxlength="64"></label><button>Entrar</button></form></html>');
      }
      if (req.url === '/access' && req.method === 'POST') {
        if (!validOrigin(req) || req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') return reply(res, 403, { error: 'origin' });
        const ip = clientIp(req), time = now();
        for (const [key, value] of attempts) if (time - value.at > 60_000) attempts.delete(key);
        const count = attempts.get(ip) ?? { at: time, count: 0 };
        if (count.count >= 5 || attempts.size >= 256 && !attempts.has(ip)) return reply(res, 429, { error: 'intenta más tarde' });
        count.count++; attempts.set(ip, count);
        const code = new URLSearchParams(await body(req)).get('code') ?? '';
        if (!codeHash || !equal(hash(code), codeHash) || stopped) return reply(res, 401, { error: 'Código inválido o caducado. Envía /start por Telegram.' });
        const token = randomBytes(32).toString('base64url');
        if (sessions.size >= 8) sessions.delete(sessions.keys().next().value);
        sessions.set(hash(token), true); touch();
        res.writeHead(303, { location: '/', 'cache-control': 'no-store',
          'set-cookie': `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict` });
        return res.end();
      }
      if (!authenticated(req)) { res.writeHead(303, { location: '/access', 'cache-control': 'no-store' }); return res.end(); }
      if (req.headers.origin && !validOrigin(req)) return reply(res, 403, { error: 'origin' });
      // The external access gate covers every UI/API route, including device tokens.
      const proxy = httpRequest(targetUrl(req), { method: req.method, headers: headers(req) }, upstreamRes => {
        const out = { ...upstreamRes.headers, 'cache-control': 'no-store' }; delete out['set-cookie'];
        res.writeHead(upstreamRes.statusCode, out); upstreamRes.on('error', () => res.destroy()); upstreamRes.pipe(res);
      });
      requests.add(proxy); proxy.on('close', () => requests.delete(proxy));
      proxy.on('error', () => { if (!res.headersSent) reply(res, 502, { error: 'gateway unavailable' }); else res.destroy(); });
      res.on('close', () => proxy.destroy()); req.on('aborted', () => proxy.destroy()); req.pipe(proxy);
    } catch { if (!res.headersSent) reply(res, 400, { error: 'invalid request' }); else res.destroy(); }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  server.on('upgrade', (req, socket, head) => {
    if (!clientIp(req) || !authenticated(req) || !validOrigin(req) || req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return;
    }
    const generation = epoch;
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => socket.destroy());
    let target;
    try { target = targetUrl(req); } catch { socket.destroy(); return; }
    const proxy = httpRequest(target, { headers: headers(req) });
    requests.add(proxy); proxy.on('close', () => requests.delete(proxy));
    proxy.on('upgrade', (upstreamRes, target, upstreamHead) => {
      if (generation !== epoch || !authenticated(req)) { socket.destroy(); target.destroy(); return; }
      sockets.add(target); target.on('close', () => { sockets.delete(target); socket.destroy(); });
      target.on('error', () => socket.destroy()); socket.on('close', () => target.destroy());
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(upstreamRes.headers).map(([k, v]) => `${k}: ${v}\r\n`).join('')}\r\n`);
      const observe = activityFrames(touch); if (head.length) { observe(head); target.write(head); }
      if (upstreamHead.length) socket.write(upstreamHead);
      socket.on('data', observe); socket.pipe(target); target.pipe(socket);
    });
    proxy.on('response', upstreamRes => { upstreamRes.resume(); socket.destroy(); });
    proxy.on('error', () => socket.destroy()); proxy.end();
  });
  const control = createServer(async (req, res) => {
    if (!equal(req.headers.authorization, `Bearer ${controlSecret}`)) return reply(res, 401, {});
    try {
      if (req.url === '/state' && req.method === 'GET') return reply(res, 200, { lastActivity, active: !stopped && !!codeHash, sockets: sockets.size });
      if (req.url === '/activity' && req.method === 'POST') {
        const { event } = JSON.parse(await body(req));
        if (!Number.isSafeInteger(event) || event < 0) return reply(res, 400, {});
        for (const [key, at] of activityEvents) if (now() - at >= 24 * 60 * 60_000) activityEvents.delete(key);
        if (!activityEvents.has(event)) {
          if (activityEvents.size >= 4096) activityEvents.delete(activityEvents.keys().next().value);
          activityEvents.set(event, now()); touch();
        }
        return reply(res, 200, { ok: true });
      }
      if (req.url === '/revoke' && req.method === 'POST') { stopped = true; revoke(); return reply(res, 200, { ok: true }); }
      if (req.url === '/resume' && req.method === 'POST') { stopped = false; return reply(res, 200, { ok: true }); }
      if (req.url === '/start' && req.method === 'POST') {
        const value = JSON.parse(await body(req));
        const result = startTail.then(() => start(value)); startTail = result.catch(() => {});
        return reply(res, 200, await result);
      }
      return reply(res, 404, {});
    } catch { return reply(res, 503, { error: 'access unavailable' }); }
  });
  const close = () => { stopped = true; revoke(); server.closeAllConnections(); control.closeAllConnections(); server.close(); control.close(); };
  return { server, control, close, state: () => ({ lastActivity, active: !!codeHash, idleMs }) };
}

async function main() {
  const origin = process.env.OPENCLAW_UI_ORIGIN ?? 'https://goatlab-gateway.fly.dev';
  const owner = process.env.TELEGRAM_ALLOWED_USERS;
  const eventFile = `${process.env.GOATLAB_STATE_DIR ?? '/data'}/ui-start.json`;
  const saved = existsSync(eventFile) ? JSON.parse(readFileSync(eventFile, 'utf8')) : {};
  const lastEvent = saved.event ?? -1;
  const saveEvent = (event, events) => {
    const temp = `${eventFile}.tmp`; writeFileSync(temp, JSON.stringify({ event, events }), { mode: 0o600 });
    const fd = openSync(temp, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, eventFile);
    const dir = openSync(process.env.GOATLAB_STATE_DIR ?? '/data', 'r'); try { fsyncSync(dir); } finally { closeSync(dir); }
  };
  const access = createUiAccess({ origin, owner, lastEvent, events: saved.events, saveEvent, controlSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    reset: async chat => {
      const healthy = await fetch('http://127.0.0.1:3001/healthz', { signal: AbortSignal.timeout(2000) });
      if (!healthy.ok) throw new Error('gateway not ready');
      await run('python3', [`${process.env.GOATLAB_SKILL_DIR}/scripts/workflow.py`, 'reset', `--chat=${chat}`], { timeout: 30_000 });
    },
    sendWelcome: async (chat, base, code) => {
      const result = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: `Hola, bienvenido a OpenClaw.\n\nIngresa a ${base}/access\n\nCódigo para la UI web: ${code}\n\nCaduca con otro /start o al apagarse el Gateway.\nTelegram funciona sin código.\nElige un procedimiento para continuar.`,
          link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[{ text: '⚽ Goatlab', callback_data: '/goatlab' }]] } }),
      });
      if (!result.ok || !(await result.json()).ok) throw new Error('welcome unavailable');
    },
  });
  access.server.listen(4003, '127.0.0.1'); access.control.listen(4004, '127.0.0.1');
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { access.close(); process.exit(0); });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('ui-access: initialization failed'); process.exit(1); });
