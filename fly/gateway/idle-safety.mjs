import { randomUUID } from 'node:crypto';
// Use the reserved local helper, avoiding another full CLI process on the 2 GB VM.
export function callNative(method, params, { password = process.env.OPENCLAW_GATEWAY_PASSWORD,
  WebSocketImpl = WebSocket, timeoutMs = 10_000 } = {}) {
  if (!password) return Promise.reject(new Error('local gateway password unavailable'));
  return new Promise((resolve, reject) => {
    const socket = new WebSocketImpl('ws://127.0.0.1:3001');
    let settled = false;
    const finish = (error, value) => {
      if (settled) return; settled = true; clearTimeout(timer); socket.close();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('native idle RPC timeout')), timeoutMs);
    socket.addEventListener('error', () => finish(new Error('native idle RPC unavailable')));
    socket.addEventListener('close', () => { if (!settled) finish(new Error('native idle RPC closed')); });
    socket.addEventListener('message', event => {
      try {
        const message = JSON.parse(event.data);
        if (message.event === 'connect.challenge') {
          socket.send(JSON.stringify({ type: 'req', id: 'connect', method: 'connect', params: {
            minProtocol: 4, maxProtocol: 4,
            client: { id: 'gateway-client', version: '2026.9.6', platform: 'linux', mode: 'backend' },
            role: 'operator', scopes: ['operator.admin'], auth: { password },
          } }));
        }
        if (message.type !== 'res') return;
        if (message.id === 'connect') {
          if (!message.ok) return finish(new Error('native idle RPC authentication rejected'));
          socket.send(JSON.stringify({ type: 'req', id: 'operation', method, params }));
        }
        if (message.id === 'operation') {
          if (!message.ok) return finish(new Error('native idle RPC rejected'));
          finish(null, message.payload);
        }
      } catch { finish(new Error('native idle RPC invalid response')); }
    });
  });
}
// Native admission freeze closes the race between checking jobs and Fly stop.
export async function prepareNativeStop(call = callNative) {
  const result = await call('gateway.suspend.prepare', { requestId: `goatlab-idle-${randomUUID()}`, terminalPolicy: 'preserve' });
  if (result.status === 'busy') return null;
  if (result.status !== 'ready' || result.activeCount !== 0 || !result.suspensionId) throw new Error('native stop not ready');
  return result.suspensionId;
}
export async function resumeNativeStop(suspensionId, call = callNative) {
  await call('gateway.suspend.resume', { suspensionId });
}
