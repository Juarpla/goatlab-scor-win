import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { addUsage } from '../src/lib/r2-usage.js';
export async function recordOperations(operations, repo = process.env.GOATLAB_REPO || '.') {
  if (!operations || !Object.values(operations).some(row => row?.opsA || row?.opsB)) return;
  const dir = join(repo, 'public/data'); await mkdir(dir, { recursive: true });
  const path = join(dir, 'r2-usage.json'), temporary = path + '.' + randomUUID() + '.tmp';
  let previous; try { previous = JSON.parse(await readFile(path, 'utf8')); } catch {}
  try { await writeFile(temporary, JSON.stringify(addUsage(previous, operations), null, 2) + '\n'); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}
