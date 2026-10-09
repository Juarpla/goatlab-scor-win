"""Durable single-flight image-to-video tasks. A lost POST is never repeated."""
import argparse
import fcntl
import hashlib
import http.client
import json
import os
import re
import socket
import sys
import subprocess
import time
import urllib.error
import urllib.request
import urllib.parse
from pathlib import Path
from common import agnes_authority, atomic_json, database, request_json
from agnes import retry_seconds

MODEL = 'agnes-video-2.5-flash'
CLIP_SECONDS = 6
IDENTIFIER_KEYS = {'id', 'videoid', 'taskid', 'resultid', 'generationid'}


def response_identifiers(payload):
    """Any identifier prevents a rejection proof; only unique video IDs permit GET recovery."""
    present, video_ids = False, set()
    def walk(value):
        nonlocal present
        if isinstance(value, dict):
            for key, item in value.items():
                normalized = re.sub(r'[^a-z0-9]', '', str(key).lower())
                if normalized in IDENTIFIER_KEYS:
                    present = True
                    if normalized == 'videoid' and isinstance(item, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,200}', item):
                        video_ids.add(item)
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)
    walk(payload)
    return present, next(iter(video_ids)) if len(video_ids) == 1 else None


def start_interval():
    """Starter operative pace: one start every 30s, below the 5 RPM provider tier."""
    try:
        return max(12.0, min(120.0, float(os.environ.get('AGNES_VIDEO_START_INTERVAL', '30'))))
    except (TypeError, ValueError):
        return 30.0


class VideoPool:
    def __init__(self, path, clock=time.time, sleep=time.sleep, state=None):
        self.path, self.clock, self.sleep = Path(path), clock, sleep
        self.state = state if state is not None else agnes_authority(clock)
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

    def error(self, match, ordinal, stage, error, attemptId=None, next=None):
        """Keep bounded diagnostics without credentials, signed URLs or raw headers."""
        headers = error.headers or {}
        proven_rejected, video_id = False, None
        try:
            body = error.read(4097)
            complete = bool(body) and len(body) <= 4096 and not error.read(1)
            length = headers.get('Content-Length')
            if length is not None:
                try: complete = complete and int(length) == len(body)
                except (TypeError, ValueError): complete = False
            raw = body.decode('utf8', 'strict')
            def invalid_constant(_):
                raise ValueError('non-JSON numeric constant')
            payload = json.loads(raw, parse_constant=invalid_constant)
            identified, video_id = response_identifiers(payload)
            proven_rejected = complete and isinstance(payload, dict) and not identified
        except (OSError, ValueError, RecursionError, http.client.HTTPException):
            raw = body.decode('utf8', 'replace') if 'body' in locals() else '[unreadable response]'
        for key,value in os.environ.items():
            if value and len(value)>5 and key.endswith(('_KEY','_TOKEN','_SECRET')): raw=raw.replace(value,'[redacted]')
        raw=re.sub(r'(?i)(bearer\s+)[^\s"<>]+',r'\1[redacted]',raw)
        raw=re.sub(r'(?i)("(?:token|api[_-]?key|secret|authorization|password)"\s*:\s*)"[^" ]*"',r'\1"[redacted]"',raw)
        raw=re.sub(r'(https?://[^\s"?]+)\?[^\s"]+',r'\1?[redacted]',raw)
        request_id=str(headers.get('X-Request-ID') or headers.get('Request-ID') or '')[:200]
        for key,value in os.environ.items():
            if value and len(value)>5 and key.endswith(('_KEY','_TOKEN','_SECRET')):
                request_id=request_id.replace(value,'[redacted]')
                if video_id and value in video_id: video_id=None
        record={'at':self.clock(),'model':MODEL,'stage':stage,'httpStatus':error.code,
                'body':raw[:2048],'requestId':request_id,'videoId':None,
                'attemptId':attemptId,'next':next or self.error_next(stage,error.code,video_id,proven_rejected)}
        self.diagnostic(match,ordinal,record)
        retry=retry_seconds(headers.get('Retry-After'));status=error.code;error.close()
        return status,retry,video_id,proven_rejected

    def diagnostic(self, match, ordinal, record):
        record.update(matchId=match, ordinal=ordinal, code=('provider-http' if record.get('httpStatus') else 'transport-or-response'))
        record['body'] = self.safe_detail(record.get('body', ''))
        if getattr(self, 'diagnostic_out', None):
            path = self.diagnostic_out / 'video-diagnostics.json'
            try: history = json.loads(path.read_text())
            except (OSError, ValueError): history = []
            atomic_json(path, (history + [record])[-128:])
        print('agnes-video: ' + json.dumps(record, ensure_ascii=False), file=sys.stderr, flush=True)
        self.db.execute('INSERT INTO video_errors(match_id,ordinal,metadata) VALUES(?,?,?)',(match,ordinal,json.dumps(record)))
        self.db.execute('DELETE FROM video_errors WHERE id NOT IN (SELECT id FROM video_errors ORDER BY id DESC LIMIT 128)')

    def transport(self, match, ordinal, stage, video_id=None, error=None, response=None, attemptId=None, next=None):
        self.diagnostic(match,ordinal,{'at':self.clock(),'model':MODEL,'stage':stage,'httpStatus':None,
                                      'body': self.safe_detail({'errorType': type(error).__name__ if error else 'UnknownError', 'message': str(error) if error else 'respuesta inválida', 'response': response}), 'requestId':'','videoId':None,
                                      'attemptId':attemptId,'next':next or self.transport_next(stage)})

    @staticmethod
    def error_next(stage, status, video_id, proven_rejected):
        if video_id:
            return 'identificador recuperado de la respuesta; consultar tarea sin repetir POST'
        if stage == 'retrieve':
            return 'reintentar consulta en la ventana de recuperación' if status != 429 else 'esperar Retry-After y reintentar consulta en la ventana de recuperación'
        if status == 429 and proven_rejected:
            return 'cuota devuelta; esperar Retry-After y reintentar con un nuevo intento'
        return 'intento archivado sin identificador; siguiente intento permitido; consumo conservado'

    @staticmethod
    def transport_next(stage):
        if stage == 'retrieve':
            return 'reintentar consulta en la ventana de recuperación'
        if stage == 'persist-accepted':
            return 'identificador guardado; reintentar solo la actualización remota; no se repite POST'
        return 'intento archivado sin identificador; siguiente intento permitido; consumo conservado'

    @staticmethod
    def safe_detail(value):
        def clean(item):
            if isinstance(item, dict):
                return {key: '[redacted]' if re.search(r'token|key|secret|authorization|password|prompt|image|url|video.?id', str(key), re.I) else clean(val) for key, val in item.items()}
            if isinstance(item, list): return [clean(val) for val in item[:10]]
            return item
        raw = json.dumps(clean(value), ensure_ascii=False, default=str) if not isinstance(value, str) else value
        for key, secret in os.environ.items():
            if secret and key.endswith(('_KEY', '_TOKEN', '_SECRET')):
                raw = raw.replace(secret, '[redacted]')
        raw = re.sub(r'(?i)("(?:token|api[_-]?key|secret|authorization|password|prompt|video[_-]?id)"\s*:\s*)"[^"\n]*"', r'\1"[redacted]"', raw)
        raw = re.sub(r'(?i)(bearer\s+)[^\s"<>]+', r'\1[redacted]', raw)
        raw = re.sub(r'https?://[^\s"<>]+', '[endpoint]', raw)
        return raw[:2048]

    def failure_details(self, match):
        rows = self.db.execute('SELECT ordinal,metadata FROM video_errors WHERE match_id=? ORDER BY id DESC LIMIT 5', (match,)).fetchall()
        details = []
        for row in reversed(rows):
            record = json.loads(row['metadata'])
            attempt = record.get('attemptId') or 'detalle original no conservado'
            following = record.get('next') or 'detalle original no conservado'
            details.append(f"clip {row['ordinal']+1}: etapa={record['stage']} modelo={record['model']} HTTP={record['httpStatus'] or 'sin respuesta'} requestId={record['requestId'] or 'no disponible'} intento={attempt} registrado={record['at']}; {record['body']}; siguiente: {following}")
        return details

    def bank(self, match, prompts, images, out, deadline, expires, call=request_json, download=None, cancelled=lambda:False, verified=None):
        if not prompts or not images: return {'clips': [], 'failures': ['faltan prompts de video o imágenes de referencia']}
        if not os.environ.get('AGNES_API_KEY'): return {'clips': [], 'failures': ['falta AGNES_API_KEY']}
        out = Path(out); out.mkdir(parents=True, exist_ok=True)
        self.diagnostic_out = out
        verified = set(verified or [])
        diagnostics_path = out / 'video-diagnostics.json'
        try: prior_diagnostics = json.loads(diagnostics_path.read_text())
        except (OSError, ValueError): prior_diagnostics = []
        download = download or self.download
        clips, failures = [], []
        headers = {'Authorization': 'Bearer ' + os.environ['AGNES_API_KEY']}
        deadline=min(deadline,expires)
        with self.path.with_suffix('.video.lock').open('w') as lock:
            # Another bank must not wait for a lock while a healthy task is polling.
            try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError: return {'clips': [], 'failures': ['otra generación en curso; montaje parcial sin espera']}
            self.cleanup()
            # The 60-second error recovery window belongs to this bank invocation.
            # Hourly runs may retrieve the same task again, but never recreate it.
            self.db.execute('DELETE FROM video_recovery WHERE match_id=?', (match,))
            target = max(0, min(2, len(prompts)) - len(verified))
            if not target: return {'clips': [], 'failures': [], 'diagnostics': prior_diagnostics}
            for ordinal in range(5):
                if f'clip-{ordinal}.mp4' in verified: continue
                prompt = prompts[ordinal % len(prompts)]
                if self.clock() >= deadline or cancelled(): break
                try:
                    remote = self.state.status(match, 'video', ordinal)
                except ValueError as error:
                    failures.append(str(error)); break
                accepted_path = out / f'clip-{ordinal}.accepted.json'
                try: accepted = json.loads(accepted_path.read_text())
                except (OSError, ValueError): accepted = None
                if accepted and remote and accepted.get('attemptId') == remote.get('attemptId') and not remote.get('videoId') and remote['state']=='uncertain':
                    try:
                        self.state.event(remote['attemptId'], 'accepted', videoId=accepted['videoId'])
                        remote = self.state.status(match, 'video', ordinal)
                    except ValueError as error:
                        self.transport(match, ordinal, 'persist-accepted', error=error, attemptId=remote['attemptId'])
                        failures.append(f'clip {ordinal+1}: identificador guardado; actualización remota pendiente; no se repite POST')
                        break
                if remote:
                    expected_prompt = hashlib.sha256(prompt['prompt'].encode()).hexdigest()
                    expected_reference = hashlib.sha256(images[ordinal%len(images)]['url'].encode()).hexdigest()
                    if not remote.get('videoId') and (remote.get('promptHash') != expected_prompt or remote.get('model', MODEL) != MODEL or (remote.get('referenceHash') and remote['referenceHash'] != expected_reference)):
                        failures.append('slot pertenece a otra versión de prompts o referencia'); break
                    cached = self.db.execute('SELECT status,result FROM video_tasks WHERE match_id=? AND ordinal=?', (match,ordinal)).fetchone()
                    if not (remote['state']=='completed' and cached and cached['status']=='done'):
                        status = 'pending' if remote.get('videoId') else {'completed':'used','rejected':'limited'}.get(remote['state'],remote['state'])
                        self.db.execute('INSERT OR REPLACE INTO video_tasks VALUES(?,?,?,?,?,?,?,NULL)', (match,ordinal,status,remote.get('videoId'),prompt['prompt'],images[ordinal%len(images)]['url'],expires))
                row = self.db.execute('SELECT * FROM video_tasks WHERE match_id=? AND ordinal=?', (match,ordinal)).fetchone()
                if row and row['status']=='done':
                    saved = json.loads(row['result'])
                    if Path(saved['path']).exists(): clips.append(saved)
                    else: failures.append(f'clip {ordinal+1}: archivo perdido; no se regenera')
                    if len(clips)>=target: break
                    continue
                if row and row['status'] in ('failed','used','abandoned'): continue
                video_id = row['video_id'] if row else None
                if row and row['status']=='uncertain' and not video_id:
                    self.state.event(remote['attemptId'], 'abandoned')
                    self.db.execute("UPDATE video_tasks SET status='abandoned' WHERE match_id=? AND ordinal=?", (match,ordinal))
                    failures.append(f'clip {ordinal+1}: intento anterior sin identificador archivado; siguiente intento permitido')
                    continue
                # Pair by attempt, not by successes: a confirmed failure moves to a new image.
                reference = row['reference'] if row else images[ordinal%len(images)]['url']
                self.db.execute('INSERT OR IGNORE INTO video_models VALUES(?,?,?)',(match,ordinal,MODEL))
                if not video_id:
                    occupied = self.db.execute("SELECT COUNT(*) FROM video_tasks WHERE match_id=? AND status IN ('done','pending','uncertain')", (match,)).fetchone()[0]
                    if occupied>=2: break
                    while not video_id and self.clock()<deadline and not cancelled():
                        rate = self.db.execute('SELECT next_at FROM video_rate WHERE id=1').fetchone()
                        wait=max(0,(rate[0] if rate else 0)-self.clock())
                        if self.clock()+wait+1>=deadline: break
                        if wait: self.sleep(wait)
                        if cancelled() or self.clock()+1>=deadline: break
                        try:
                            admission = self.state.reserve(match, 'video', ordinal, prompt['prompt'], MODEL, expires, reference)
                        except ValueError as error:
                            self.diagnostic(match,ordinal,{'at':self.clock(),'model':MODEL,'stage':'admission','httpStatus':None,'body':self.safe_detail(str(error)),'requestId':'','videoId':None,'attemptId':None,'next':'sin nueva solicitud; reutilizar evidencia o esperar ritmo/cuota'})
                            failures.append(str(error)); break
                        if not admission.get('canPost'):
                            retry_at = admission.get('retryAtMs', 0)/1000
                            if retry_at > self.clock() and retry_at+1 < deadline:
                                self.sleep(retry_at-self.clock()); continue
                            self.diagnostic(match,ordinal,{'at':self.clock(),'model':MODEL,'stage':'admission','httpStatus':None,'body':self.safe_detail(admission.get('reason','autoridad Agnes no concedió permiso')),'requestId':'','videoId':None,'attemptId':None,'next':'sin nueva solicitud; reutilizar evidencia o esperar ritmo/cuota'})
                            failures.append(admission.get('reason','autoridad Agnes no concedió permiso')); break
                        attempt_id = admission['attemptId']
                        self.db.execute('INSERT OR REPLACE INTO video_tasks VALUES(?,?,?,NULL,?,?,?,NULL)', (match,ordinal,'uncertain',prompt['prompt'],reference,expires))
                        self.db.execute('INSERT OR REPLACE INTO video_rate VALUES(1,?)', (self.clock()+start_interval()+0.1,))
                        result = None
                        create_call = call
                        if call is request_json:
                            def create_call(*args, **kwargs):
                                return request_json(*args, **kwargs, observe=lambda status, headers, payload: self.diagnostic(match, ordinal, {'at': self.clock(), 'model': MODEL, 'stage': 'create-response', 'httpStatus': status, 'requestId': str(headers.get('X-Request-ID') or '')[:200], 'videoId': None, 'attemptId': attempt_id, 'next': 'interpretar respuesta; si hay identificador, guardarlo antes de actualizar el estado', 'body': self.safe_detail(payload)}))
                        try:
                            result=create_call('https://apihub.agnes-ai.com/v1/videos', {'model':MODEL,'prompt':'Use <Picture 1> as the visual reference. '+prompt['prompt'],'mode':'reference','images':[reference],'seconds':'6','size':'720P','aspect_ratio':'9:16','n':1}, headers=headers, timeout=min(30,max(.1,deadline-self.clock())))
                            if not isinstance(result,dict): raise ValueError('respuesta inválida')
                            _, video_id = response_identifiers(result)
                            if not isinstance(video_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,200}',video_id): raise ValueError('sin video_id')
                            atomic_json(accepted_path, {'attemptId': attempt_id, 'videoId': video_id})
                            self.db.execute("UPDATE video_tasks SET status='pending',video_id=? WHERE match_id=? AND ordinal=?",(video_id,match,ordinal))
                            try: self.state.event(attempt_id, 'accepted', videoId=video_id)
                            except ValueError as error:
                                self.transport(match,ordinal,'persist-accepted',error=error,attemptId=attempt_id)
                                failures.append(f'clip {ordinal+1}: identificador guardado; actualización remota pendiente; no se repite POST')
                                return {'clips':clips,'failures':failures + self.failure_details(match),'diagnostics':json.loads(diagnostics_path.read_text())}
                        except urllib.error.HTTPError as error:
                            status,retry,video_id,proven_rejected=self.error(match,ordinal,'create',error,attemptId=attempt_id)
                            if video_id:
                                atomic_json(accepted_path, {'attemptId': attempt_id, 'videoId': video_id})
                                self.state.event(attempt_id, 'accepted', videoId=video_id)
                                self.db.execute("UPDATE video_tasks SET status='pending',video_id=? WHERE match_id=? AND ordinal=?",(video_id,match,ordinal));self.recovery(match,deadline,ordinal)
                            elif status==429 and proven_rejected:
                                self.state.event(attempt_id, 'hard-rejected-429', httpStatus=429, provenRejected=True, retryAfterMs=retry*1000)
                                self.db.execute("UPDATE video_tasks SET status='limited' WHERE match_id=? AND ordinal=?",(match,ordinal))
                                self.db.execute('INSERT OR REPLACE INTO video_rate VALUES(1,?)',(self.clock()+max(start_interval()+0.1,retry),))
                                if self.clock()+max(start_interval()+0.1,retry)+1>=deadline: failures.append(f'clip {ordinal+1}: HTTP 429; presupuesto agotado');break
                                continue
                            elif 400<=status<500 and status!=429:
                                self.db.execute("UPDATE video_tasks SET status='failed' WHERE match_id=? AND ordinal=?",(match,ordinal))
                                self.state.event(attempt_id, 'uncertain', httpStatus=status, stage='create')
                            else:
                                self.state.event(attempt_id, 'uncertain', httpStatus=status, stage='create')
                            if not video_id:
                                if status == 429: self.db.execute('INSERT OR REPLACE INTO video_rate VALUES(1,?)',(self.clock()+max(start_interval()+0.1,retry),))
                                self.state.event(attempt_id, 'abandoned')
                                self.db.execute("UPDATE video_tasks SET status='abandoned' WHERE match_id=? AND ordinal=?",(match,ordinal))
                            failures.append(f'clip {ordinal+1}: HTTP {status}')
                            break
                        except (OSError,ValueError) as error:
                            self.transport(match,ordinal,'create',error=error,response=result,attemptId=attempt_id)
                            try: self.state.event(attempt_id, 'uncertain', stage='create')
                            except ValueError: pass
                            self.state.event(attempt_id, 'abandoned')
                            self.db.execute("UPDATE video_tasks SET status='abandoned' WHERE match_id=? AND ordinal=?",(match,ordinal))
                            failures.append(f'clip {ordinal+1}: creación incierta sin identificador; intento archivado sin devolver cuota');break
                    if not video_id:
                        state=self.db.execute('SELECT status FROM video_tasks WHERE match_id=? AND ordinal=?',(match,ordinal)).fetchone()
                        if state and state[0] in ('failed','abandoned'): continue
                        break
                while self.clock()<deadline and not cancelled():
                    recovery=self.db.execute('SELECT deadline,ordinal FROM video_recovery WHERE match_id=?',(match,)).fetchone()
                    limit=min(deadline,recovery[0]) if recovery and recovery[1]==ordinal else deadline
                    if self.clock()>=limit: break
                    try:
                        claim = self.state.pollclaim(match, ordinal)
                    except ValueError as error:
                        failures.append(str(error)); break
                    if not claim.get('canPoll'):
                        failures.append(claim.get('reason','recuperación remota no disponible')); break
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
                            self.state.event(claim['attemptId'], 'failed')
                            self.db.execute("UPDATE video_tasks SET status='failed' WHERE match_id=? AND ordinal=?",(match,ordinal))
                            failures.append(f'clip {ordinal+1}: Agnes confirmó fallo');break
                        if status=='completed':
                            if not remote or remote['state'] != 'completed':
                                self.state.event(claim['attemptId'], 'completed')
                            atomic_json(out/f'clip-{ordinal}.response.json',result)
                            saved=download(result.get('url'),out/f'clip-{ordinal}.mp4',limit)
                            saved.update(model=MODEL,prompt=prompt['prompt'],videoId=video_id,reference=reference,index=ordinal,attemptId=claim['attemptId'])
                            if remote:
                                saved.update(model=remote.get('model',MODEL),promptHash=remote.get('promptHash'),referenceHash=remote.get('referenceHash'))
                                if remote.get('promptHash') != hashlib.sha256(prompt['prompt'].encode()).hexdigest():
                                    saved.pop('prompt',None)
                            atomic_json(out/f'clip-{ordinal}.json',saved)
                            self.db.execute("UPDATE video_tasks SET status='done',result=? WHERE match_id=? AND ordinal=?",(json.dumps(saved),match,ordinal))
                            clips.append(saved);break
                        if status not in ('queued','in_progress'): limit=self.recovery(match,deadline,ordinal)
                    except urllib.error.HTTPError as error:
                        status,retry,_,_=self.error(match,ordinal,'retrieve',error,attemptId=claim['attemptId'])
                        limit=self.recovery(match,deadline,ordinal)
                        if status==429:
                            try: self.state.event(claim['attemptId'], 'poll-throttle', httpStatus=429, retryAfterMs=retry*1000, stage='retrieve')
                            except ValueError: break
                            self.db.execute('INSERT OR REPLACE INTO video_poll_rate VALUES(?,?)',(video_id,self.clock()+retry))
                            if self.clock()+retry>=limit: break
                            self.sleep(retry)
                        else:
                            try: self.state.event(claim['attemptId'], 'uncertain', httpStatus=status, stage='retrieve')
                            except ValueError: break
                    except (OSError,ValueError,subprocess.SubprocessError) as error:
                        self.transport(match,ordinal,'retrieve',video_id,error=error,attemptId=claim['attemptId'])
                        try: self.state.event(claim['attemptId'], 'uncertain', stage='retrieve')
                        except ValueError: pass
                        limit=self.recovery(match,deadline,ordinal)
                    if self.clock()+2>=limit: break
                    self.sleep(2)
                state=self.db.execute('SELECT status FROM video_tasks WHERE match_id=? AND ordinal=?',(match,ordinal)).fetchone()
                if state[0]=='pending':
                    failures.append(f'clip {ordinal+1}: recuperación vencida o tarea pendiente; montaje parcial');break
                if len(clips)>=target: break
        if len(clips) < target and not failures: failures.append('faltan clips: plazo, cancelación o cinco intentos consumidos')
        if failures:
            failures.extend(self.failure_details(match))
        return {'clips':clips[:target],'failures':failures,'diagnostics':json.loads(diagnostics_path.read_text()) if diagnostics_path.exists() else prior_diagnostics}

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
    result=pool.bank(source['matchId'],source['prompts'],source['images'],args.out,source['deadline'],source['expiresAt'],cancelled=cancelled,verified=source.get('verifiedClips', []))
    print(json.dumps(result))
