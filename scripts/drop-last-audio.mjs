/** Compatibility adapter: the durable series decides which audio is last. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const chat = process.argv.find(a => a.startsWith('--chat='))?.slice(7);
if (!chat) { console.error('drop-last-audio: falta --chat'); process.exit(1); }
try {
  await promisify(execFile)(process.env.PYTHON_BIN || 'python3', [fileURLToPath(new URL('../fly/gateway/workspace/skills/goatlab/scripts/workflow.py', import.meta.url)), 'drop-last', `--chat=${chat}`], { env: process.env });
  console.log('dropped');
} catch { console.error('drop-last-audio: no se pudo sustituir el audio'); process.exit(1); }
