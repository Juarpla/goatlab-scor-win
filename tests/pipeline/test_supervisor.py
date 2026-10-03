"""Exercise a real supervisor process and local HTTP worker, with no external APIs."""
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'fly/gateway/workspace/skills/goatlab/scripts'))
from workflow import Workflow

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
                    payload = json.dumps({'id': body['requestId'], 'duplicate': sum(b['requestId'] == body['requestId'] for b in calls) > 1}).encode()
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
                (media / 'a-b.json').write_text(json.dumps({'assets': [{'url': 'https://example.test/photo.jpg', 'width': 1472, 'height': 2624}], 'attribution': 'Autor: licencia'}))
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
