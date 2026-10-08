"""Exercise a real supervisor process and local HTTP worker, with no external APIs."""
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'fly/gateway/workspace/skills/goatlab/scripts'))
from workflow import Workflow
from render_ledger import Ledger

class SupervisorTests(unittest.TestCase):
    def test_waits_for_media_preserves_order_and_replays_stable_id_after_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            flow = Workflow(root / 'goatlab.sqlite')
            flow.select('1', {'matchId': 'a-b', 'scripts': [{'title': 'Título', 'hook': 'Gancho'} for _ in range(10)]})
            ids = [flow.receive('1', f'voice-{i}', str(i))['requestId'] for i in range(10)]
            flow.db.execute("UPDATE tasks SET status='done' WHERE kind='media'")
            # A task interrupted before the worker accepted it must be recovered.
            flow.db.execute("UPDATE tasks SET status='running' WHERE id=?", (ids[0],))
            calls = []
            class Worker(BaseHTTPRequestHandler):
                def do_GET(self):
                    self.send_response(200); self.end_headers(); self.wfile.write(b'{"ok":true,"workflowProtocol":2}')
                def do_POST(self):
                    body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                    calls.append(body)
                    Ledger(root/'render-ledger').put({'id':'job-'+body['requestId'],'requestId':body['requestId'],'expiresAt':body['expiresAt'],'status':'done'})
                    payload = json.dumps({'jobId':'job-'+body['requestId'], 'duplicate': sum(b['requestId'] == body['requestId'] for b in calls) > 1}).encode()
                    self.send_response(200); self.end_headers(); self.wfile.write(payload)
                def log_message(self, *_): pass
            server = ThreadingHTTPServer(('127.0.0.1', 0), Worker)
            thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            self.addCleanup(server.server_close); self.addCleanup(server.shutdown)
            env = {**os.environ, 'GOATLAB_STATE_DIR': directory, 'WORKER_URL': f'http://127.0.0.1:{server.server_port}', 'RENDER_SECRET': 'test'}
            script = Path(__file__).resolve().parents[2] / 'fly/gateway/workspace/skills/goatlab/scripts/workflow.py'
            def start():
                return subprocess.Popen([sys.executable, str(script), 'supervise'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            def stop(process):
                process.terminate()
                _, stderr = process.communicate(timeout=8)
                self.assertEqual(process.returncode, 0, stderr.decode())
            def wait_for(predicate):
                deadline = time.monotonic() + 18
                while not predicate() and time.monotonic() < deadline: time.sleep(.05)
                self.assertTrue(predicate(), 'supervisor no avanzó')
            process = start()
            try:
                time.sleep(1.2)
                self.assertEqual(calls, [])  # reception is independent of photos
                media = root / 'media-pack'; media.mkdir()
                (media / 'a-b.json').write_text(json.dumps({'assets': [{'source':'agnes', 'url': 'https://example.test/photo.jpg', 'width': 1472, 'height': 2624}], 'attribution': 'Autor: licencia'}))
                (media / 'a-b.ready').write_text('{}')
                wait_for(lambda: len(calls) == 10)
                wait_for(lambda: flow.db.execute("SELECT COUNT(*) FROM tasks WHERE kind='render' AND status='done'").fetchone()[0] == 10)
            finally: stop(process)
            self.assertEqual([b['requestId'] for b in calls], ids)
            self.assertEqual([b['variant'] for b in calls], list(range(10)))
            self.assertTrue(all(b['assets'][0]['width'] == 1472 and b['attribution'] for b in calls))
            # Simulate the crash window after POST acceptance but before outbox commit.
            flow.db.execute("UPDATE tasks SET status='running',next_at=0 WHERE id=?", (ids[-1],))
            process = start()
            try: wait_for(lambda: len(calls) == 11)
            finally: stop(process)
            self.assertEqual(calls[-1]['requestId'], ids[-1])
            flow.db.close()

    def test_real_generator_never_searches_external_photos_and_finishes_graphics_bank_before_post(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);data=root/'public/data';data.mkdir(parents=True)
            (data/'fixtures.json').write_text(json.dumps({'matches':[{'id':'a-b','webId':'a-b','home':'Spain','away':'Czechia','status':'NS','kickoff':'2030-10-03T18:00:00Z'}]}))
            (data/'top.json').write_text(json.dumps({'version':1,'generatedAt':datetime.now(timezone.utc).isoformat(),'ranking':[{'id':'a-b'}],'extra':[]}))
            preload=root/'provider.mjs'
            preload.write_text("globalThis.fetch=()=>{throw Error('External HTTP forbidden')};")
            flow=Workflow(root/'goatlab.sqlite')
            flow.select('1',{'matchId':'a-b','scripts':[{'hook':'Gancho'} for _ in range(10)]})
            request=flow.receive('1','voice','event')['requestId']
            calls=[]
            class Worker(BaseHTTPRequestHandler):
                def log_message(self,*_):pass
                def do_GET(self):
                    self.send_response(200);self.end_headers();self.wfile.write(b'{"workflowProtocol":2}')
                def do_POST(self):
                    body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                    progress=json.loads((root/'media-pack/a-b.progress.json').read_text())
                    calls.append((body,progress))
                    self.send_response(200);self.end_headers();self.wfile.write(json.dumps({'jobId':'accepted'}).encode())
            server=ThreadingHTTPServer(('127.0.0.1',0),Worker)
            threading.Thread(target=server.serve_forever,daemon=True).start()
            env={**os.environ,'GOATLAB_STATE_DIR':str(root),'GOATLAB_REPO':str(root),'WORKER_URL':f'http://127.0.0.1:{server.server_port}','RENDER_SECRET':'test','NODE_OPTIONS':f'--import={preload}','AGNES_API_KEY':'','TELEGRAM_BOT_TOKEN':''}
            script=Path(__file__).resolve().parents[2]/'fly/gateway/workspace/skills/goatlab/scripts/workflow.py'
            process=subprocess.Popen([sys.executable,str(script),'supervise'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            try:
                deadline=time.monotonic()+25
                while not calls and time.monotonic()<deadline:time.sleep(.05)
                self.assertTrue(calls,'no render after the bank attempt')
                body,progress=calls[0]
                self.assertEqual(progress['phase'],'finished');self.assertEqual(body['assets'],[])
                self.assertEqual(body['mediaMinimum'],0)
                persisted=json.loads(flow.db.execute('SELECT payload FROM tasks WHERE id=?',(request,)).fetchone()[0])
                self.assertEqual(persisted['assets'],[])
            finally:
                process.terminate();_,error=process.communicate(timeout=8)
                server.shutdown();server.server_close();flow.db.close()
                self.assertEqual(process.returncode,0,error.decode())
