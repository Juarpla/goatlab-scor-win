import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from http.server import HTTPServer,BaseHTTPRequestHandler
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'fly/gateway/workspace/skills/goatlab/scripts'))
from workflow import Workflow
from render_ledger import serve
from telegram_input import chat_id,file_id

class TelegramTests(unittest.TestCase):
    def test_webhook_uses_original_ids_deduplicates_and_forwards_native_commands(self):
        forwarded=[]
        class Native(BaseHTTPRequestHandler):
            def log_message(self,*_):pass
            def do_POST(self):
                forwarded.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                self.send_response(200);self.end_headers();self.wfile.write(b'{"ok":true}')
        native=HTTPServer(('127.0.0.1',0),Native)
        threading.Thread(target=native.serve_forever,daemon=True).start()
        self.addCleanup(native.server_close);self.addCleanup(native.shutdown)
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ,{'RENDER_SECRET':'secret','TELEGRAM_WEBHOOK_SECRET':'hook','TELEGRAM_ALLOWED_USERS':'1','OPENCLAW_TELEGRAM_URL':f'http://127.0.0.1:{native.server_port}'}):
            flow=Workflow(Path(root)/'goatlab.sqlite')
            flow.select('telegram:1',{'matchId':'a-b','scripts':[{'hook':'Hola'} for _ in range(10)]})
            server=serve(root,0)
            try:
                url=f'http://127.0.0.1:{server.server_address[1]}/telegram-webhook'
                def send(body,secret='hook'):
                    request=urllib.request.Request(url,json.dumps(body).encode(),headers={'X-Telegram-Bot-Api-Secret-Token':secret})
                    with urllib.request.urlopen(request) as response:return json.load(response)
                voice={'update_id':100,'message':{'message_id':288,'from':{'id':1},'chat':{'id':1,'type':'private'},'voice':{'file_id':'AwACAgEAA_real_original_voice'}}}
                with self.assertRaises(urllib.error.HTTPError) as error:send(voice,'wrong')
                error.exception.close()
                send(voice);send(voice)
                audio=dict(flow.db.execute('SELECT * FROM audios').fetchone())
                self.assertEqual(audio['event'],'288');self.assertEqual(audio['file_id'],voice['message']['voice']['file_id'])
                self.assertEqual(flow.db.execute('SELECT COUNT(*) FROM audios').fetchone()[0],1)
                self.assertEqual(json.loads(flow.db.execute("SELECT payload FROM tasks WHERE kind='render'").fetchone()[0])['chatId'],'1')
                self.assertEqual(forwarded,[])
                for text in ['/new','/start','/goatlab','2']:
                    send({'message':{'text':text,'chat':{'id':1,'type':'private'},'from':{'id':1}}})
                    if text == '/new': self.assertIsNotNone(flow.current('1'))
                    if text == '/start': self.assertIsNone(flow.current('1'))
                self.assertEqual([u['message']['text'] for u in forwarded],['/new','/start','/goatlab','2'])
                flow.reset('1')
                send(voice)
                self.assertEqual(len(forwarded),5)
            finally:server.shutdown();server.server_close();flow.db.close()

    def test_ids_never_confuse_openclaw_address_or_local_path_with_telegram(self):
        self.assertEqual(chat_id('telegram:123'),'123')
        with self.assertRaises(ValueError):file_id('/home/node/input.ogg')
        with self.assertRaises(ValueError):chat_id('unknown')
