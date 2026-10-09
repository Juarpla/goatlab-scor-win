import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { safeMediaMessage } from '../src/lib/media-diagnostics.js';
let report;
try { report=JSON.parse(await readFile('.cache/media-run.json','utf8')); }
catch { report={mode:process.env.AGNES_SKIP_VIDEO==='1'?'images-only':process.env.AGNES_SKIP_IMAGES==='1'?'clips-only':'all',results:[],pending:1,error:'No se completó la generación. Revisar mantenimiento, comprobación y preflight en esta ejecución.'}; }
const safe=value=>safeMediaMessage(value,process.env).replace(/[\r\n|]/g,' ').replace(/[<>]/g,'');
let summary=`## Banco de medios\n\nModo: ${safe(report.mode)} · Resultado: ${report.pending ? 'faltan recursos solicitados' : 'recursos solicitados verificados'}\n\n`;
if(report.error) summary+=safe(report.error)+'\n\n';
summary+='| Partido | Fotos verificadas | Clips verificados | Diagnóstico |\n| --- | --- | --- | --- |\n';
for(const row of report.results??[]) {
  const diagnosis = row.failures?.[0] || 'Verificado';
  const missing = (row.failures?.length && !(row.diagnostics?.length)) ? ' (detalle original no conservado)' : '';
  summary+=`| ${safe(row.matchId)} | ${row.images}/4 | ${row.clips}/2 | ${safe(diagnosis + missing)} |\n`;
}
if(report.runUrl) summary+=`\n[Ver ejecución y logs en GitHub](${safe(report.runUrl)})\n`;
await mkdir('.cache',{recursive:true});
await writeFile('.cache/media-run.json',JSON.stringify(report,null,2));
if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
console.log(summary);
