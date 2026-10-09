/** Restore accepted tasks before archiving old requests without a recoverable ID. */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { transact } from './agnes-state.mjs';
export async function reconcileVideoRecovery({ dir, env, transactImpl = transact, log = console.log }) {
  let folders=[];
  try { folders=await readdir(dir); } catch (error) { if(error.code!=='ENOENT') throw error; }
  for(const matchId of folders.filter(id=>/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(id))) {
    let names=[]; try { names=await readdir(join(dir,matchId)); } catch { continue; }
    for(const name of names) {
      const found=name.match(/^clip-([0-4])\.accepted\.json$/); if(!found) continue;
      const accepted=JSON.parse(await readFile(join(dir,matchId,name),'utf8'));
      const {slot}=await transactImpl('status',{matchId,kind:'video',ordinal:Number(found[1])},{env});
      if(slot?.state!=='uncertain' || slot.videoId || slot.attemptId!==accepted.attemptId) continue;
      await transactImpl('event',{attemptId:slot.attemptId,eventId:randomUUID(),type:'accepted',videoId:accepted.videoId},{env});
      log(`media: ${matchId}: clip ${Number(found[1])+1}: identificador recuperado; consulta disponible sin repetir POST`);
    }
  }
  const result=await transactImpl('recover-uncertain',{}, {env});
  for(const row of result.abandoned ?? []) log(`media: ${row.matchId}: clip ${row.ordinal+1}: intento sin identificador archivado; consumo conservado; nuevo intento permitido`);
  return result;
}
