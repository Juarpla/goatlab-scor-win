"""One editable Telegram status per active series, backed by temporary local state."""
import json
import os
import time
import urllib.error
from pathlib import Path
from common import request_json

STAGES = {'voiceDownload':'descargando audio','transcription':'transcribiendo audio','photos':'preparando fotos',
          'voiceAdjustment':'ajustando la voz','clips':'preparando clips','planning':'planificando el montaje','planningFallback':'montaje local con gráficos y animaciones','capture':'renderizando','mux':'mezclando audio y música','delivery':'enviando video'}


def progress_text(count, phase, jobs, created, now, received=0, target=15, clips=None, failures=()):
    target = target if target in (10,15) else 10
    count = min(target, max(0, count))
    filled = count * 10 // target
    lines=[f'📸 Imágenes: {count}/{target} · {count*100//target}%', '█'*filled+'░'*(10-filled)]
    if clips is not None: lines.append(f'🎞 Clips: {min(3,max(0,clips))}/3')
    if phase=='finished' and failures: lines.append('⚠️ '+ '; '.join(str(f)[:160] for f in failures[:4]))
    if phase=='failed': lines.append('⚠️ Preparación interrumpida; se conserva el banco y el audio para reintentar.')
    elif phase=='finished' and count==0: lines.append('Banco sin imágenes: los videos usarán motion graphics y animaciones.')
    elif phase=='finished' and count<target: lines.append(f'Preparación finalizada con {count} imágenes disponibles.')
    elif phase in ('generating','generating-clips','searching'): lines.append('Generando imágenes con Agnes…')
    live=next((j for j in jobs if j.get('status') in ('working','delivering','queued')),None)
    failed=next((j for j in jobs if j.get('status') in ('error','delivery-unknown')),None)
    done=sum(j.get('status')=='done' for j in jobs)
    if live:
        lines.append(f'🎬 Video {live.get("variant",0)+1}: {STAGES.get(live.get("currentStage"),"en cola")}')
    elif failed:
        lines.append(f'⚠️ Video {failed.get("variant",0)+1}: detenido; puedes pedir reintentarlo.')
    else:
        pending=max(0,received-done)
        lines.append(f'🎙 Audios recibidos: {received}')
        lines.append(f'🎬 {pending} videos pendientes: '+('preparando el banco visual' if phase in ('searching','generating','generating-clips') else 'en cola') if pending else ('🎬 Esperando audios' if not jobs else f'🎬 Videos entregados: {done}'))
    if any(j.get('planningFallback') or j.get('planModel')=='local-montage' for j in jobs): lines.append('Montaje de respaldo activo: gráficos y animaciones basados en tu audio.')
    elapsed=max(0,int(now-created))
    lines.append(f'⏱ Tiempo transcurrido: {elapsed//60:02d}:{elapsed%60:02d}')
    return '\n'.join(lines)


class ProgressReporter:
    def __init__(self, flow, send=None, clock=time.time):
        self.flow,self.clock=flow,clock
        self.next=0
        self.send=send or self.telegram
        flow.db.execute('CREATE TABLE IF NOT EXISTS progress(series_id TEXT PRIMARY KEY,message_id INTEGER,text TEXT,last_sent REAL NOT NULL DEFAULT 0)')

    def telegram(self,method,body):
        result=request_json(f'https://api.telegram.org/bot{os.environ["TELEGRAM_BOT_TOKEN"]}/{method}',body,timeout=10)
        if not result.get('ok'): raise ValueError('progreso no confirmado')
        return result['result']

    def update(self, records):
        now=self.clock()
        if now<self.next:return
        self.next=now+10
        db=self.flow.db
        db.execute('DELETE FROM progress WHERE series_id NOT IN (SELECT id FROM series WHERE active=1 AND created>?)',(now-86400,))
        by_request={r.get('requestId'):r for r in records}
        for series in db.execute('SELECT * FROM series WHERE active=1 AND created>?',(now-86400,)).fetchall():
            path=Path(os.environ.get('MEDIA_PACK_DIR',str(self.flow.state/'media-pack')))/f'{series["match_id"]}.progress.json'
            try: media=json.loads(path.read_text())
            except (OSError,ValueError): media={'count':0,'phase':'generating'}
            audios=db.execute('SELECT id FROM audios WHERE series_id=? AND cancelled=0 ORDER BY ordinal',(series['id'],)).fetchall()
            jobs=[]
            for audio in audios:
                pending=db.execute('SELECT status,payload FROM tasks WHERE id=?',(audio[0],)).fetchone()
                remote=by_request.get(audio[0])
                # An explicit retry supersedes the previous error while waiting for media/submission.
                retrying=pending and pending[0] in ('queued','running') and remote and remote.get('status')=='error'
                if remote and not retrying: jobs.append(remote)
                elif pending and pending[0]=='failed': jobs.append({'status':'error','variant':json.loads(pending[1]).get('variant',0)})
            task=db.execute('SELECT status FROM tasks WHERE id=?',('media:'+series['match_id'],)).fetchone()
            if task and task[0]=='failed': media['phase']='failed'
            text=progress_text(media.get('count',0),media.get('phase'),jobs,series['created'],now,len(audios),media.get('target',15),media.get('clips'),media.get('failures',[]))
            prior=db.execute('SELECT * FROM progress WHERE series_id=?',(series['id'],)).fetchone()
            if prior and prior['message_id'] is None:continue
            if prior and (now-prior['last_sent']<10 or prior['text']==text):continue
            if prior and now-prior['last_sent']<30 and prior['text'].rsplit('\n',1)[0]==text.rsplit('\n',1)[0]:continue
            body={'chat_id':series['chat'],'text':text}
            method='sendMessage'
            if prior:
                method='editMessageText';body['message_id']=prior['message_id']
            try:
                result=self.send(method,body)
                message_id=prior['message_id'] if prior else result['message_id']
                db.execute('INSERT OR REPLACE INTO progress VALUES(?,?,?,?)',(series['id'],message_id,text,now))
            except urllib.error.HTTPError as error:
                if error.code==429:
                    try: wait=json.load(error).get('parameters',{}).get('retry_after',30)
                    except Exception:wait=30
                    self.next=now+max(10,int(wait))
                error.close()
            except Exception:
                # A lost creation response may have created a message. Do not duplicate it.
                if not prior:db.execute('INSERT OR REPLACE INTO progress VALUES(?,?,?,?)',(series['id'],None,text,now))
