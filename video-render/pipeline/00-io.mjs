import { execFile } from 'node:child_process';
import { renameSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Shared helpers used before and between pipeline stages. */
export async function mediaDuration(file) {
  const { stdout } = await run('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim());
}

export function writeJson(path, value) {
  writeFileSync(`${path}.tmp`, JSON.stringify(value));
  renameSync(`${path}.tmp`, path);
}
