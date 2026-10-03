/** Compatibility adapter. Python owns ordering and persistence, including retries. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const args = new Map(process.argv.slice(2).map(a => { const i = a.indexOf('='); return [a.slice(0, i), a.slice(i + 1)]; }));
const command = ['enqueue', `--chat=${args.get('--chat') ?? ''}`, `--match=${args.get('--match') ?? ''}`, `--audio=${args.get('--audio') ?? ''}`];
if (args.get('--event')) command.push(`--event=${args.get('--event')}`);
try {
  await promisify(execFile)(process.env.PYTHON_BIN || 'python3', [fileURLToPath(new URL('../fly/gateway/workspace/skills/goatlab/scripts/workflow.py', import.meta.url)), ...command], { env: process.env });
  console.log('pending');
} catch { console.error('queue-render: no se pudo registrar el audio'); process.exit(1); }
