"""Durable single-flight image-to-video tasks. A lost POST is never repeated."""
import argparse
import fcntl
import hashlib
import json
import os
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
        ''')

    def cleanup(self):
        self.db.execute('DELETE FROM video_tasks WHERE expires<=?', (self.clock(),))

    def bank(self, match, prompts, images, out, deadline, expires, call=request_json, download=None, cancelled=lambda:False):
        if not prompts or not images: return {'clips': [], 'failures': ['faltan prompts de video o imágenes de referencia']}
        if not os.environ.get('AGNES_API_KEY'): return {'clips': [], 'failures': ['falta AGNES_API_KEY']}
        out = Path(out); out.mkdir(parents=True, exist_ok=True)
        download = download or self.download
        clips, failures = [], []
        headers = {'Authorization': 'Bearer ' + os.environ['AGNES_API_KEY']}
        with self.path.with_suffix('.video.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            self.cleanup()
            for ordinal, prompt in enumerate(prompts[:5]):
                if self.clock() >= min(deadline, expires) or cancelled(): break
                row = self.db.execute('SELECT * FROM video_tasks WHERE match_id=? AND ordinal=?', (match,ordinal)).fetchone()
                if row and row['status']=='done':
                    saved = json.loads(row['result'])
                    if Path(saved['path']).exists(): clips.append(saved)
                    else: failures.append(f'clip {ordinal+1}: archivo perdido; no se regenera')
                    if len(clips)>=3: break
                    continue
                if row and row['status'] in ('failed','used'): continue
                if row and row['status']=='uncertain':
                    failures.append(f'clip {ordinal+1}: creación incierta; no se repite'); break
                video_id = row['video_id'] if row else None
                reference = row['reference'] if row else images[len(clips)%len(images)]['url']
                if not video_id:
                    occupied = self.db.execute("SELECT COUNT(*) FROM video_tasks WHERE match_id=? AND status IN ('done','pending','uncertain')", (match,)).fetchone()[0]
                    if occupied>=3: break
                    active = self.db.execute("SELECT * FROM video_tasks WHERE match_id!=? AND status IN ('pending','uncertain') LIMIT 1", (match,)).fetchone()
                    if active and active['video_id']:
                        try:
                            recovered = call(f'https://apihub.agnes-ai.com/agnesapi?video_id={urllib.parse.quote(active["video_id"], safe="")}&model_name={MODEL}', headers=headers, timeout=min(15,max(1,deadline-self.clock())))
                            if recovered.get('status') in ('completed','failed'):
                                self.db.execute("UPDATE video_tasks SET status='used',result=? WHERE match_id=? AND ordinal=?", (json.dumps(recovered),active['match_id'],active['ordinal']))
                                active = None
                        except (OSError,ValueError): pass
                    if active:
                        failures.append('otra tarea Agnes pendiente o incierta; no se inicia otra simultánea'); break
                    rate = self.db.execute('SELECT next_at FROM video_rate WHERE id=1').fetchone()
                    wait = max(0, (rate[0] if rate else 0)-self.clock())
                    if self.clock()+wait+10>=min(deadline, expires): break
                    if wait: self.sleep(wait)
                    if cancelled() or self.clock()+1>=min(deadline,expires): break
                    self.db.execute('INSERT OR REPLACE INTO video_tasks VALUES(?,?,?,NULL,?,?,?,NULL)', (match,ordinal,'uncertain',prompt['prompt'],reference,expires))
                    self.db.execute('INSERT OR REPLACE INTO video_rate VALUES(1,?)', (self.clock()+60.1,))
                    try:
                        result = call('https://apihub.agnes-ai.com/v1/videos', {'model':MODEL,'prompt':prompt['prompt'],'mode':'reference','images':[reference],'seconds':'6','size':'720P','aspect_ratio':'9:16','n':1}, headers, timeout=min(30,max(1,deadline-self.clock())))
                        video_id = result.get('video_id')
                        if not isinstance(video_id,str) or not video_id: raise ValueError('sin video_id; creación incierta')
                        self.db.execute("UPDATE video_tasks SET status='pending',video_id=? WHERE match_id=? AND ordinal=?", (video_id,match,ordinal))
                    except urllib.error.HTTPError as error:
                        status, retry = error.code, retry_seconds(error.headers.get('Retry-After')); error.close()
                        # 4xx rejection did not create a task; 5xx may have accepted it.
                        if 400<=status<500:
                            self.db.execute("UPDATE video_tasks SET status=? WHERE match_id=? AND ordinal=?", ('limited' if status==429 else 'failed',match,ordinal))
                        if status==429:
                            self.db.execute('INSERT OR REPLACE INTO video_rate VALUES(1,?)', (self.clock()+max(60.1,retry),))
                        failures.append(f'clip {ordinal+1}: HTTP {status}')
                        if status==429 or status>=500: break
                        continue
                    except (OSError, ValueError):
                        failures.append(f'clip {ordinal+1}: creación incierta; no se repite'); break
                while self.clock()<min(deadline, expires) and not cancelled():
                    try:
                        result = call(f'https://apihub.agnes-ai.com/agnesapi?video_id={urllib.parse.quote(video_id, safe="")}&model_name={MODEL}', headers=headers, timeout=min(15,max(1,deadline-self.clock())))
                        status = result.get('status')
                        if status=='failed':
                            self.db.execute("UPDATE video_tasks SET status='failed' WHERE match_id=? AND ordinal=?", (match,ordinal))
                            failures.append(f'clip {ordinal+1}: Agnes confirmó fallo'); break
                        if status=='completed':
                            atomic_json(out/f'clip-{ordinal}.response.json', result)
                            saved = download(result.get('url'), out/f'clip-{ordinal}.mp4', deadline)
                            saved.update(model=MODEL, prompt=prompt['prompt'], videoId=video_id, reference=reference, index=ordinal)
                            atomic_json(out/f'clip-{ordinal}.json', saved)
                            self.db.execute("UPDATE video_tasks SET status='done',result=? WHERE match_id=? AND ordinal=?", (json.dumps(saved),match,ordinal))
                            clips.append(saved); break
                    except urllib.error.HTTPError as error:
                        status = error.code; retry = retry_seconds(error.headers.get('Retry-After')); error.close()
                        if status==429:
                            if self.clock()+retry>=deadline: break
                            self.sleep(retry)
                        else: failures.append(f'clip {ordinal+1}: consulta HTTP {status}'); break
                    except (OSError, ValueError, subprocess.SubprocessError):
                        failures.append(f'clip {ordinal+1}: consulta/descarga pendiente de recuperación'); break
                    if self.clock()+2>=deadline: break
                    self.sleep(2)
                row = self.db.execute('SELECT status FROM video_tasks WHERE match_id=? AND ordinal=?', (match,ordinal)).fetchone()
                if row[0]=='pending':
                    failures.append(f'clip {ordinal+1}: tarea pendiente; no se crea otra simultánea'); break
                if len(clips)>=3: break
        return {'clips': clips[:3], 'failures': failures}

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
