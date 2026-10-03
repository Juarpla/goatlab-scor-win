import json
import os
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'fly/gateway/workspace/skills/goatlab/scripts'))
from render_ledger import Ledger, serve

class RenderLedgerTests(unittest.TestCase):
    def test_authentication_atomic_record_and_expiration(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ,{'RENDER_SECRET':'secret'}):
            server=serve(folder,0)
            self.addCleanup(server.server_close)
            self.addCleanup(server.shutdown)
            url=f'http://127.0.0.1:{server.server_address[1]}/render-ledger'
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(url)
            self.assertEqual(caught.exception.code,401)
            caught.exception.close()
            record={'id':'job-'+'a'*32,'expiresAt':int((time.time()+3600)*1000),'status':'queued'}
            request=urllib.request.Request(url,json.dumps(record).encode(),method='PUT',headers={'Authorization':'Bearer secret'})
            with urllib.request.urlopen(request) as response:
                self.assertEqual(json.load(response),{'ok':True})
            with urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer secret'})) as response:
                self.assertEqual(json.load(response),[record])
            ledger=Ledger(Path(folder)/'render-ledger',clock=lambda:time.time()+86401)
            self.assertEqual(ledger.records(),[])
            self.assertFalse(list((Path(folder)/'render-ledger').glob('*.json')))

    def test_budget_rejects_growth_instead_of_increasing_capacity(self):
        with tempfile.TemporaryDirectory() as folder, patch('render_ledger.MAX_BYTES',256):
            ledger=Ledger(folder,clock=lambda:1000)
            record={'id':'job-'+'b'*32,'expiresAt':2000000,'payload':'x'*300}
            with self.assertRaisesRegex(ValueError,'presupuesto'):
                ledger.put(record)
            self.assertFalse(list(Path(folder).glob('*.json')))
