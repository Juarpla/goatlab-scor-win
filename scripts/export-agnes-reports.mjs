import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeQuotaReports, mergeHourlyReports } from '../src/lib/agnes-reports.js';
import { recordOperations } from './record-r2-operations.mjs';

const read = async file => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return {}; } };
async function atomic(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2));
    await rename(temp, file);
  } finally { await rm(temp, { force: true }); }
}

export async function exportAgnesReports({ report, repo = '.', now = Date.now() }) {
  if (!report || !report.quota || typeof report.quota !== 'object' || Array.isArray(report.quota)) throw new Error('reporte Agnes inválido');
  const data = join(repo, 'public/data');
  const bank = join(data, 'media-pack');
  await mkdir(bank, { recursive: true });
  const quota = join(data, 'agnes-quota.json');
  const hourly = join(bank, '_agnes-hourly.json');
  await atomic(quota, mergeQuotaReports(await read(quota), report.quota, now));
  await atomic(hourly, mergeHourlyReports(await read(hourly), report, now));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { transact } = await import('../fly/gateway/workspace/skills/goatlab/scripts/agnes-state.mjs');
    const report = await transact('report', {});
    await recordOperations(report.operations);
    await exportAgnesReports({ report, repo: process.env.GOATLAB_REPO || '.' });
    console.log('agnes: reportes públicos actualizados');
  } catch (error) {
    await recordOperations(error.operations);
    console.error('agnes: estado privado no disponible; reportes anteriores conservados');
    process.exitCode = 2;
  }
}
