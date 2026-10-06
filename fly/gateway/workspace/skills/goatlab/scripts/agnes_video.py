"""Durable single-flight image-to-video tasks. A lost POST is never repeated."""
import argparse
import fcntl
import hashlib
import json
import os
import re
import socket
import subprocess
import time
import urllib.error
import urllib.request
import urllib.parse
from pathlib import Path
from common import atomic_json, database, request_json
from agnes import retry_seconds

MODEL = 'agnes-video-2.5-flash'


class VideoPool:
    def __init__(self, path, clock=time.time, sleep=time.sleep):
        self.path, self.clock, self.sleep = Path(path), clock, sleep
        self.db = database(path)
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS video_tasks(match_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
            status TEXT NOT NULL, video_id TEXT, prompt TEXT NOT NULL, reference TEXT NOT NULL,
            expires REAL NOT NULL, result TEXT, PRIMARY KEY(match_id,ordinal));
          CREATE TABLE IF NOT EXISTS video_rate(id INTEGER PRIMARY KEY, next_at REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS video_poll_rate(video_id TEXT PRIMARY KEY, next_at REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS video_recovery(match_id TEXT PRIMARY KEY, deadline REAL NOT NULL, ordinal INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS video_models(match_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
            model TEXT NOT NULL, PRIMARY KEY(match_id,ordinal));
          CREATE TABLE IF NOT EXISTS video_errors(id INTEGER PRIMARY KEY, match_id TEXT NOT NULL,
            ordinal INTEGER NOT NULL, metadata TEXT NOT NULL);
        ''')
        self.db.execute('INSERT OR IGNORE INTO video_models SELECT match_id,ordinal,? FROM video_tasks',(MODEL,))

    def cleanup(self):
        self.db.execute('DELETE FROM video_tasks WHERE expires<=?', (self.clock(),))
        self.db.execute('DELETE FROM video_poll_rate WHERE video_id NOT IN (SELECT video_id FROM video_tasks WHERE video_id IS NOT NULL)')
        for table in ('video_recovery','video_models','video_errors'):
            self.db.execute(f'DELETE FROM {table} WHERE match_id NOT IN (SELECT DISTINCT match_id FROM video_tasks)')

    def recovery(self, match, deadline, ordinal):
        self.db.execute('INSERT OR IGNORE INTO video_recovery VALUES(?,?,?)', (match,min(deadline,self.clock()+60),ordinal))
        self.db.execute('UPDATE video_recovery SET ordinal=? WHERE match_id=?',(ordinal,match))
        return self.db.execute('SELECT deadline FROM video_recovery WHERE match_id=?',(match,)).fetchone()[0]

    def error(self, match, ordinal, stage, error):
        """Keep bounded diagnostics without credentials, signed URLs or raw headers."""
        try: raw = error.read(4096).decode('utf8','replace')
        except OSError: raw = '[unreadable response]'
        try: payload = json.loads(raw)
        except ValueError: payload = {}
        video_id = payload.get('video_id') if isinstance(payload,dict) else None
        if not isinstance(video_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,200}',video_id): video_id = None
        for key,value in os.environ.items():
            if value and len(value)>5 and key.endswith(('_KEY','_TOKEN','_SECRET')): raw=raw.replace(value,'[redacted]')
        raw=re.sub(r'(?i)(bearer\s+)[^\s"<>]+',r'\1[redacted]',raw)
        raw=re.sub(r'(?i)("(?:token|api[_-]?key|secret|authorization|password)"\s*:\s*)"[^" ]*"',r'\1"[redacted]"',raw)
        raw=re.sub(r'(https?://[^\s"?]+)\?[^\s"]+',r'\1?[redacted]',raw)
        headers=error.headers or {}
        request_id=str(headers.get('X-Request-ID') or headers.get('Request-ID') or '')[:200]
        for key,value in os.environ.items():
            if value and len(value)>5 and key.endswith(('_KEY','_TOKEN','_SECRET')):
                request_id=request_id.replace(value,'[redacted]')
                if video_id and value in video_id: video_id=None
        record={'at':self.clock(),'model':MODEL,'stage':stage,'httpStatus':error.code,
                'body':raw[:2048],'requestId':request_id,'videoId':video_id}
        self.diagnostic(match,ordinal,record)
        retry=retry_seconds(headers.get('Retry-After'));status=error.code;error.close()
        return status,retry,video_id

    def diagnostic(self, match, ordinal, record):
        self.db.execute('INSERT INTO video_errors(match_id,ordinal,metadata) VALUES(?,?,?)',(match,ordinal,json.dumps(record)))
        self.db.execute('DELETE FROM video_errors WHERE id NOT IN (SELECT id FROM video_errors ORDER BY id DESC LIMIT 128)')

    def transport(self, match, ordinal, stage, video_id=None):
        self.diagnostic(match,ordinal,{'at':self.clock(),'model':MODEL,'stage':stage,'httpStatus':None,
                                     'body':'resultado incierto: transporte o respuesta inválida','requestId':'','videoId':video_id})

    def bank(self, match, prompts, images, out, deadline, expires, call=request_json, download=None, cancelled=lambda:False):
        if not prompts or not images: return {'clips': [], 'failures': ['faltan prompts de video o imágenes de referencia']}
        if not os.environ.get('AGNES_API_KEY'): return {'clips': [], 'failures': ['falta AGNES_API_KEY']}
        out = Path(out); out.mkdir(parents=True, exist_ok=True)
        download = download or self.download
        clips, failures = [], []
        headers = {'Authorization': 'Bearer ' + os.environ['AGNES_API_KEY']}
        deadline=min(deadline,expires)
        with self.path.with_suffix('.video.lock').open('w') as lock:
            # Another bank must not wait for a lock while a healthy task is polling.
            try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError: return {'clips': [], 'failures': ['otra generación en curso; montaje parcial sin espera']}
            self.cleanup()
            for ordinal, prompt in enumerate(prompts[:5]):
                if self.clock() >= deadline or cancelled(): break
                row = self.db.execute('SELECT * FROM video_tasks WHERE match_id=? AND ordinal=?', (match,ordinal)).fetchone()
                if row and row['status']=='done':
                    saved = json.loads(row['result'])
                    if Path(saved['path']).exists(): clips.append(saved)
                    else: failures.append(f'clip {ordinal+1}: archivo perdido; no se regenera')
                    if len(clips)>=3: break
                    continue
                if row and row['status'] in ('failed','used'): continue
                video_id = row['video_id'] if row else None
                if row and row['status']=='uncertain' and not video_id:
                    failures.append(f'clip {ordinal+1}: creación incierta sin identificador; montaje parcial inmediato'); break
                # Pair by attempt, not by successes: a confirmed failure moves to a new image.
                reference = row['reference'] if row else images[ordinal%len(images)]['url']
                self.db.execute('INSERT OR IGNORE INTO video_models VALUES(?,?,?)',(match,ordinal,MODEL))
                if not video_id:
                    active = self.db.execute("SELECT * FROM video_tasks WHERE match_id!=? AND status IN ('pending','uncertain') LIMIT 1", (match,)).fetchone()
                    poll_rate=self.db.execute('SELECT next_at FROM video_poll_rate WHERE video_id=?',(active['video_id'],)).fetchone() if active and active['video_id'] else None
                    if active and active['video_id'] and (not poll_rate or poll_rate[0]<=self.clock()):
                        try:
                            recovered = call(self.task_url(active['video_id']), headers=headers, timeout=min(2,max(.1,deadline-self.clock())))
                            if isinstance(recovered,dict) and recovered.get('status') in ('completed','failed'):
                                self.db.execute("UPDATE video_tasks SET status='used',result=? WHERE match_id=? AND ordinal=?", (json.dumps(recovered),active['match_id'],active['ordinal']))
                                active = None
                        except urllib.error.HTTPError as error:
                            status,retry,_=self.error(active['match_id'],active['ordinal'],'retrieve',error)
                            if status==429: self.db.execute('INSERT OR REPLACE INTO video_poll_rate VALUES(?,?)',(active['video_id'],self.clock()+retry))
                        except (OSError,ValueError): pass
                    if active:
                        failures.append('otra tarea pendiente o incierta; montaje parcial sin otra pausa'); break
                    occupied = self.db.execute("SELECT COUNT(*) FROM video_tasks WHERE match_id=? AND status IN ('done','pending','uncertain')", (match,)).fetchone()[0]
                    if occupied>=3: break
                    while not video_id and self.clock()<deadline and not cancelled():
                        rate = self.db.execute('SELECT next_at FROM video_rate WHERE id=1').fetchone()
                        wait=max(0,(rate[0] if rate else 0)-self.clock())
                        if self.clock()+wait+1>=deadline: break
                        if wait: self.sleep(wait)
                        if cancelled() or self.clock()+1>=deadline: break
                        self.db.execute('INSERT OR REPLACE INTO video_tasks VALUES(?,?,?,NULL,?,?,?,NULL)', (match,ordinal,'uncertain',prompt['prompt'],reference,expires))
                        self.db.execute('INSERT OR REPLACE INTO video_rate VALUES(1,?)', (self.clock()+60.1,))
                        try:
                            result=call('https://apihub.agnes-ai.com/v1/videos', {'model':MODEL,'prompt':'Use <Picture 1> as the visual reference. '+prompt['prompt'],'mode':'reference','images':[reference],'seconds':'6','size':'720P','aspect_ratio':'9:16','n':1}, headers=headers, timeout=min(30,max(.1,deadline-self.clock())))
                            if not isinstance(result,dict): raise ValueError('respuesta inválida')
                            video_id=result.get('video_id')
                            if not isinstance(video_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,200}',video_id): raise ValueError('sin video_id')
                            self.db.execute("UPDATE video_tasks SET status='pending',video_id=? WHERE match_id=? AND ordinal=?",(video_id,match,ordinal))
                        except urllib.error.HTTPError as error:
                            status,retry,video_id=self.error(match,ordinal,'create',error)
                            if video_id:
                                self.db.execute("UPDATE video_tasks SET status='pending',video_id=? WHERE match_id=? AND ordinal=?",(video_id,match,ordinal));self.recovery(match,deadline,ordinal)
                            elif status==429:
                                self.db.execute("UPDATE video_tasks SET status='limited' WHERE match_id=? AND ordinal=?",(match,ordinal))
                                self.db.execute('INSERT OR REPLACE INTO video_rate VALUES(1,?)',(self.clock()+max(60.1,retry),))
                                if self.clock()+max(60.1,retry)+1>=deadline: failures.append(f'clip {ordinal+1}: HTTP 429; presupuesto agotado');break
                                continue
                            elif 400<=status<500:
                                self.db.execute("UPDATE video_tasks SET status='failed' WHERE match_id=? AND ordinal=?",(match,ordinal))
                            failures.append(f'clip {ordinal+1}: HTTP {status}')
                            break
                        except (OSError,ValueError):
                            self.transport(match,ordinal,'create')
                            failures.append(f'clip {ordinal+1}: creación incierta sin identificador; montaje parcial inmediato');break
                    if not video_id:
                        state=self.db.execute('SELECT status FROM video_tasks WHERE match_id=? AND ordinal=?',(match,ordinal)).fetchone()
                        if state and state[0]=='failed': continue
                        break
                while self.clock()<deadline and not cancelled():
                    recovery=self.db.execute('SELECT deadline,ordinal FROM video_recovery WHERE match_id=?',(match,)).fetchone()
                    limit=min(deadline,recovery[0]) if recovery and recovery[1]==ordinal else deadline
                    if self.clock()>=limit: break
                    poll_rate=self.db.execute('SELECT next_at FROM video_poll_rate WHERE video_id=?',(video_id,)).fetchone()
                    wait=max(0,poll_rate[0]-self.clock()) if poll_rate else 0
                    if self.clock()+wait>=limit: break
                    if wait: self.sleep(wait)
                    if cancelled() or self.clock()>=limit: break
                    try:
                        result=call(self.task_url(video_id), headers=headers, timeout=min(15,max(.1,limit-self.clock())))
                        if not isinstance(result,dict): raise ValueError('respuesta inválida')
                        status=result.get('status')
                        if status=='failed':
                            self.db.execute("UPDATE video_tasks SET status='failed' WHERE match_id=? AND ordinal=?",(match,ordinal))
                            failures.append(f'clip {ordinal+1}: Agnes confirmó fallo');break
                        if status=='completed':
                            atomic_json(out/f'clip-{ordinal}.response.json',result)
                            saved=download(result.get('url'),out/f'clip-{ordinal}.mp4',limit)
                            saved.update(model=MODEL,prompt=prompt['prompt'],videoId=video_id,reference=reference,index=ordinal)
                            atomic_json(out/f'clip-{ordinal}.json',saved)
                            self.db.execute("UPDATE video_tasks SET status='done',result=? WHERE match_id=? AND ordinal=?",(json.dumps(saved),match,ordinal))
                            clips.append(saved);break
                        if status not in ('queued','in_progress'): limit=self.recovery(match,deadline,ordinal)
                    except urllib.error.HTTPError as error:
                        status,retry,_=self.error(match,ordinal,'retrieve',error)
                        limit=self.recovery(match,deadline,ordinal)
                        if status==429:
                            self.db.execute('INSERT OR REPLACE INTO video_poll_rate VALUES(?,?)',(video_id,self.clock()+retry))
                            if self.clock()+retry>=limit: break
                            self.sleep(retry)
                    except (OSError,ValueError,subprocess.SubprocessError):
                        self.transport(match,ordinal,'retrieve',video_id)
                        limit=self.recovery(match,deadline,ordinal)
                    if self.clock()+2>=limit: break
                    self.sleep(2)
                state=self.db.execute('SELECT status FROM video_tasks WHERE match_id=? AND ordinal=?',(match,ordinal)).fetchone()
                if state[0]=='pending':
                    failures.append(f'clip {ordinal+1}: recuperación vencida o tarea pendiente; montaje parcial');break
                if len(clips)>=3: break
        return {'clips':clips[:3],'failures':failures}

    @staticmethod
    def task_url(video_id):
        return f'https://apihub.agnes-ai.com/agnesapi?video_id={urllib.parse.quote(video_id,safe="")}&model_name={MODEL}'

    def download(self, url, path, deadline):
        if not isinstance(url,str) or not url.startswith('https://'): raise ValueError('URL de clip inválida')
        total = sum(p.stat().st_size for p in path.parent.parent.rglob('*.mp4'))
        size = 0
        with urllib.request.urlopen(url, timeout=min(30,max(1,deadline-self.clock()))) as response, path.with_suffix('.tmp').open('wb') as output:
            while self.clock()<deadline:
                chunk = response.read(65536)
                if not chunk: break
                size += len(chunk)
                if size>32_000_000 or total+size>128_000_000: raise ValueError('caché de clips llena')
                output.write(chunk)
            else: raise ValueError('plazo de preparación agotado')
            output.flush(); os.fsync(output.fileno())
        path.with_suffix('.tmp').replace(path)
        probe = json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height:format=duration','-of','json',str(path)], timeout=min(15,max(1,deadline-self.clock()))))
        stream = probe['streams'][0]; duration = float(probe['format']['duration'])
        if stream['width']!=720 or stream['height']!=1280 or not 4<=duration<=12.5: raise ValueError('clip de dimensiones o duración inesperadas')
        return {'path':str(path.resolve()),'file':path.name,'width':stream['width'],'height':stream['height'],'duration':duration,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}


if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--input',required=True); parser.add_argument('--out',required=True)
    args=parser.parse_args(); source=json.loads(Path(args.input).read_text())
    pool=VideoPool(Path(os.environ.get('AGNES_STATE_DB','agnes.sqlite')))
    def cancelled():
        state=Path(os.environ.get('GOATLAB_STATE_DIR','.'))/'goatlab.sqlite'
        if not state.exists(): return False
        import sqlite3
        with sqlite3.connect(state) as db:
            row=db.execute('SELECT status FROM tasks WHERE id=?', ('media:'+source['matchId'],)).fetchone()
            return bool(row and row[0]=='cancelled')
    result=pool.bank(source['matchId'],source['prompts'],source['images'],args.out,source['deadline'],source['expiresAt'],cancelled=cancelled)
    print(json.dumps(result))
