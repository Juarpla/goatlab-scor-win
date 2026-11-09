/** Read-only size report for the shared Agnes state object; it never writes to R2. */
import { signR2 } from '../src/lib/r2-signed.js';
import { resolveStateConfig } from '../src/lib/r2-state-config.js';
import { AGNES_STATE_MAX_BYTES } from '../src/lib/agnes-state.js';

const config = resolveStateConfig(process.env);
if (!config.account || !config.access || !config.secret) throw new Error('faltan credenciales R2 del estado');

const signed = signR2({ ...config, method: 'GET', body: Buffer.alloc(0), headers: { 'accept-encoding': 'identity' } });
const response = await fetch(signed.url, { method: 'GET', headers: signed.headers, signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`GET HTTP ${response.status}`);
const text = await response.text();
const state = JSON.parse(text);
const bytes = value => Buffer.byteLength(JSON.stringify(value ?? null));
const total = Buffer.byteLength(text);
const share = value => `${(value / total * 100).toFixed(1)}%`;
const without = key => ({ ...state, [key]: Array.isArray(state[key]) ? [] : {} });

console.log(`estado: ${total} / ${AGNES_STATE_MAX_BYTES} bytes (${(total / AGNES_STATE_MAX_BYTES * 100).toFixed(1)}% del tope)`);
console.log(`revision: ${state.revision} · updatedAt: ${state.updatedAt}`);
console.log('secciones:');
for (const [key, value] of Object.entries(state).sort((a, b) => bytes(b[1]) - bytes(a[1]))) {
  console.log(`  ${key.padEnd(18)} ${String(bytes(value)).padStart(8)}  ${share(bytes(value))}`);
}

const attempts = Object.entries(state.attempts ?? {});
const diagnosticsBytes = attempts.reduce((sum, [, attempt]) => sum + bytes(attempt.diagnostics), 0);
const events = attempts.reduce((sum, [, attempt]) => sum + (attempt.diagnostics?.events?.length ?? 0), 0);
console.log(`intentos: ${attempts.length} · con diagnostics: ${attempts.filter(([, a]) => a.diagnostics).length} · eventos: ${events}`);
console.log(`slots: ${Object.keys(state.slots ?? {}).length} · failureEvents: ${(state.failureEvents ?? []).length} · resources: ${Object.keys(state.resources ?? {}).length} · matches: ${Object.keys(state.matches ?? {}).length} · summaries: ${Object.keys(state.summaries ?? {}).length} · runs: ${Object.keys(state.runs ?? {}).length}`);

const attemptsWithoutDiagnostics = Object.fromEntries(attempts.map(([key, attempt]) => {
  const { diagnostics, ...rest } = attempt;
  return [key, rest];
}));
const candidates = [
  ['sin diagnostics de intentos', { ...state, attempts: attemptsWithoutDiagnostics }],
  ['sin failureEvents', without('failureEvents')],
  ['sin resources', without('resources')],
  ['sin summaries', without('summaries')],
];
console.log('ahorro si se poda:');
for (const [label, value] of candidates) console.log(`  ${label.padEnd(30)} ${String(total - bytes(value)).padStart(8)} bytes`);
