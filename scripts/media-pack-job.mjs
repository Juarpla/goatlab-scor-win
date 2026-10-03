/** Compatibility entrypoint. The supervised Python outbox owns retries and delivery. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const chat = process.argv.find(a => a.startsWith('--chat='))?.slice(7);
if (!chat) { console.error('media-pack-job: falta --chat'); process.exit(1); }
try {
  await promisify(execFile)(process.env.PYTHON_BIN || 'python3', [fileURLToPath(new URL('../fly/gateway/workspace/skills/goatlab/scripts/workflow.py', import.meta.url)), 'retry', `--chat=${chat}`], { env: process.env });
} catch { console.error('media-pack-job: selecciona primero una serie con /goatlab'); process.exit(1); }
