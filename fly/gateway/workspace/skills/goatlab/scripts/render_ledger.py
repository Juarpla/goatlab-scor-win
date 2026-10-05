"""Bounded temporary Render records on Gateway's existing Fly volume."""
import hmac
import fcntl
from contextlib import contextmanager
import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.request
import urllib.error
from pathlib import Path
from common import atomic_json

MAX_BYTES = 4_000_000

class Ledger:
    def __init__(self, directory, clock=time.time):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.clock = clock

    @contextmanager
    def locked(self):
        with (self.directory/'.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            yield

    def records(self):
        with self.locked():
            return self._records()

    def _records(self):
        for temporary in self.directory.glob('*.tmp'):
            temporary.unlink(missing_ok=True)
        records = []
        for path in self.directory.glob('job-*.json'):
            try:
                record = json.loads(path.read_text())
            except FileNotFoundError:
                continue
            if record.get('retainUntil', record.get('expiresAt', 0)) <= self.clock()*1000:
                path.unlink(missing_ok=True)
            else:
                records.append(record)
        return records

    def put(self, record):
        with self.locked():
            self._put(record)

    def _put(self, record):
        if not re.fullmatch(r'job-[a-f0-9]{32}', str(record.get('id', ''))):
            raise ValueError('identificador inválido')
        deadline = record.get('retainUntil', record.get('expiresAt', 0))
        if not isinstance(deadline,(int,float)) or not self.clock()*1000 < deadline <= (self.clock()+86400)*1000+1000:
            raise ValueError('registro caducado o plazo inválido')
        self._records()
        path = self.directory/(record['id']+'.json')
        size = len(json.dumps(record,ensure_ascii=False).encode())
        total = sum(p.stat().st_size for p in self.directory.glob('*.json') if p!=path)
        # Allow the atomic replacement alongside its predecessor within the same budget.
        if total + size + (path.stat().st_size if path.exists() else 0) > MAX_BYTES:
            raise ValueError('presupuesto del registro temporal agotado')
        atomic_json(path,record)


def serve(state, port=3002):
    ledger = Ledger(Path(state)/'render-ledger')
    ledger.records()
    secret = os.environ.get('RENDER_SECRET','')
    if not secret:
        raise ValueError('falta RENDER_SECRET para el registro Render')
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(30)
        def log_message(self,*_):
            pass
        def respond(self,code,value):
            data=json.dumps(value).encode()
            self.send_response(code); self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
        def authorized(self):
            if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+secret):
                self.respond(401,{'error':'no autorizado'}); return False
            return True
        def do_GET(self):
            if not self.authorized(): return
            if self.path!='/render-ledger': return self.respond(404,{})
            self.respond(200,ledger.records())
        def do_PUT(self):
            if not self.authorized(): return
            if self.path!='/render-ledger': return self.respond(404,{})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=512_000: raise ValueError('registro demasiado grande')
                ledger.put(json.loads(self.rfile.read(length)))
                self.respond(200,{'ok':True})
            except (ValueError,TypeError):
                self.respond(400,{'error':'registro inválido, caducado o presupuesto agotado'})
        def do_POST(self):
            if self.path != '/telegram-webhook': return self.respond(404,{})
            webhook_secret=os.environ.get('TELEGRAM_WEBHOOK_SECRET','')
            if not webhook_secret or not hmac.compare_digest(self.headers.get('X-Telegram-Bot-Api-Secret-Token',''),webhook_secret):
                return self.respond(401,{'error':'no autorizado'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=512_000: return self.respond(413,{})
                raw=self.rfile.read(length)
                update=json.loads(raw)
                from telegram_input import ingest, note_activity
                note_activity(update)
                result=ingest(update,state)
                if result is not None:
                    self.respond(200,{'ok':True})
                    if result.get('closed') and not result.get('duplicate'):
                        from common import telegram
                        try: telegram('sendMessage',{'chat_id':result['chat'],'text':'Serie completa. Los videos pendientes continúan.'})
                        except Exception: print('workflow: aviso de cierre no entregado',flush=True)
                    return
                # /start is consumed by the access gate. Native /new stays in OpenClaw.
                request=urllib.request.Request(os.environ.get('OPENCLAW_TELEGRAM_URL','http://127.0.0.1:8787/telegram-webhook'),raw,
                    headers={'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':webhook_secret})
                with urllib.request.urlopen(request,timeout=25) as response:
                    payload=response.read(512_000)
                    self.send_response(response.status); self.send_header('Content-Type','application/json');
                    self.send_header('Content-Length',str(len(payload))); self.end_headers();self.wfile.write(payload)
            except ValueError:
                self.respond(400,{'error':'evento de Telegram inválido'})
            except Exception:
                self.respond(503,{'error':'recepción temporalmente no disponible'})
    class Server(ThreadingHTTPServer):
        daemon_threads=True
        slots=threading.BoundedSemaphore(8)
        def process_request(self,request,address):
            self.slots.acquire()
            try: super().process_request(request,address)
            except Exception: self.slots.release(); raise
        def process_request_thread(self,request,address):
            try: super().process_request_thread(request,address)
            finally: self.slots.release()
    server=Server(('127.0.0.1',port),Handler)
    server.timeout=1
    threading.Thread(target=server.serve_forever,daemon=True).start()
    return server
