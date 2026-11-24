import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { auditSite, reportMarkdown } from './lib/seo-audit.mjs';

const directory = '.cache/seo';
const baselineDirectory = '.cache/seo-baseline';
await mkdir(directory, { recursive: true });
await mkdir(baselineDirectory, { recursive: true });
let previous;
try { previous = JSON.parse(await readFile(`${baselineDirectory}/report.json`, 'utf8')); } catch { /* First run or expired cache. */ }
const report = await auditSite({ previous });
const fixture = JSON.parse(await readFile(new URL('../public/data/fixtures.json', import.meta.url), 'utf8'));
const age = Date.now() - Date.parse(fixture.updatedAt);
if (!Number.isFinite(age) || age > 36 * 3_600_000 || age < -300_000) {
  report.findings.push({ level: 'warning', code: 'fixture-source-stale', path: '/encuentros/', detail: 'La captura del calendario tiene fecha inválida o más de 36 horas; revisar 1-update-data.' });
  report.summary.warnings++;
  if (report.delta) report.delta.warnings++;
}
const markdown = reportMarkdown(report);
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2) + '\n');
await writeFile(`${directory}/report.md`, markdown);
await writeFile(`${baselineDirectory}/report.json`, JSON.stringify(report));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);
if (report.summary.errors) process.exitCode = 1;
