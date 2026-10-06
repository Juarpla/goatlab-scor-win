import base64
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'fly/gateway/workspace/skills/goatlab/scripts'))
from agnes import ImagePool, retry_seconds


class AgnesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.now = 1000
        self.path = Path(self.temp.name) / 'agnes.sqlite'
        self.pool = ImagePool(self.path, clock=lambda: self.now, sleep=self.sleep)
        self.addCleanup(self.pool.db.close)
        self.env = patch.dict(os.environ, {'AGNES_API_KEY': 'test', 'AGNES_IMAGE_MODEL': 'agnes-image-2.5-flash', 'AGNES_TIMEOUT_SECONDS': '300'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def sleep(self, seconds):
        self.now += seconds

    def result(self):
        return {'data': [{'b64_json': base64.b64encode(b'\x89PNGtest').decode()}]}

    def test_rate_limit_shared_across_pools(self):
        other = ImagePool(self.path, clock=lambda: self.now, sleep=self.sleep)
        self.addCleanup(other.db.close)
        for _ in range(12): self.pool.take_slot()
        other.take_slot()
        self.assertGreaterEqual(self.now, 1060)

    @patch('agnes.subprocess.check_output', return_value=b'{"streams":[{"width":1472,"height":2624}]}')
    def test_generation_uses_2k_timeout_and_cache(self, _probe):
        calls = []
        def call(url, body, headers, timeout):
            calls.append((body, timeout))
            return self.result()
        out = Path(self.temp.name) / 'images'
        first = self.pool.generate('match', 0, 'prompt', out, call)
        self.assertEqual(self.pool.generate('match', 0, 'prompt', out, lambda *_: self.fail('cached')), first)
        self.assertEqual(calls[0][0]['size'], '2K')
        self.assertEqual(calls[0][0]['ratio'], '9:16')
        self.assertEqual(calls[0][1], 300)
        self.assertEqual(first['width'], 1472)
        with self.assertRaises(ValueError): self.pool.generate('match', 10, 'prompt', out, call)

    def test_timeout_is_not_repeated_after_restart(self):
        def timeout(*_, **__): raise TimeoutError()
        with self.assertRaisesRegex(ValueError, 'incierto'):
            self.pool.generate('match', 0, 'prompt', Path(self.temp.name) / 'images', timeout)
        restored = ImagePool(self.path, clock=lambda: self.now, sleep=self.sleep)
        self.addCleanup(restored.db.close)
        with self.assertRaisesRegex(ValueError, 'incierto'):
            restored.generate('match', 0, 'prompt', Path(self.temp.name) / 'images', lambda *_: self.fail('must not regenerate'))

    def test_two_429_stop_generation_and_keep_shared_cooldown(self):
        calls = []
        def limited(*_, **__):
            calls.append(self.now)
            raise urllib.error.HTTPError('https://test', 429, 'limited', {'Retry-After': '60'}, io.BytesIO())
        with self.assertRaisesRegex(ValueError, '429'):
            self.pool.generate('match', 0, 'prompt', Path(self.temp.name) / 'images', limited)
        self.assertEqual(len(calls), 2)
        self.assertGreaterEqual(calls[1] - calls[0], 60)
        with self.assertRaisesRegex(ValueError, 'pausado'):
            self.pool.generate('other', 0, 'prompt', Path(self.temp.name) / 'images', limited)
        self.assertEqual(retry_seconds(None), 60)

    @patch('agnes.subprocess.check_output', return_value=b'{"streams":[{"width":1472,"height":2624}]}')
    def test_four_shared_slots_are_available_and_do_not_accumulate_base64(self, _probe):
        out=Path(self.temp.name)/'images'
        for slot in range(4):
            self.pool.generate('m',slot,'fictional players',out,lambda *a,**kw:self.result())
        self.assertEqual(self.pool.db.execute("SELECT COUNT(*) FROM images WHERE status='done'").fetchone()[0],4)
        self.assertFalse(list(out.glob('*.response.json')))
        self.assertEqual(self.pool.db.execute("SELECT images FROM quota_use").fetchone()[0],4)
        self.assertEqual(self.now,1000)

class ExpiryTests(unittest.TestCase):
    def test_past_match_is_closed_even_after_control_records_are_cleaned(self):
        with tempfile.TemporaryDirectory() as folder:
            pool = ImagePool(Path(folder)/'agnes.sqlite', clock=lambda: 100000)
            self.addCleanup(pool.db.close)
            pool.cleanup()
            with self.assertRaisesRegex(ValueError,'caducado'):
                pool.generate('past',0,'prompt',Path(folder)/'images',expires_at=99999)

    def test_deadline_prevents_a_new_generation_before_sending_http(self):
        with tempfile.TemporaryDirectory() as folder:
            pool=ImagePool(Path(folder)/'agnes.sqlite',clock=lambda:1000)
            self.addCleanup(pool.db.close)
            with patch.dict(os.environ,{'AGNES_API_KEY':'test'}):
                with self.assertRaisesRegex(ValueError,'presupuesto'):
                    pool.generate('m',3,'prompt',Path(folder)/'gen',call=lambda *a,**k:self.fail('no request'),attempt_deadline=1100)
