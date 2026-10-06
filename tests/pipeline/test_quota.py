import base64
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'fly/gateway/workspace/skills/goatlab/scripts'))
from agnes import ImagePool
from agnes_video import VideoPool
from common import ensure_quota


class QuotaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.now = 1000
        self.patch = patch.dict(os.environ, {'AGNES_API_KEY': 'fake'})
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def sleep(self, seconds):
        self.now += seconds

    def images(self):
        return ImagePool(self.root / 'agnes.sqlite', clock=lambda: self.now, sleep=self.sleep)

    def videos(self):
        return VideoPool(self.root / 'agnes.sqlite', clock=lambda: self.now, sleep=self.sleep)

    def download(self, url, path, deadline):
        path.write_bytes(b'fixture')
        return {'path': str(path), 'file': path.name, 'width': 720, 'height': 1280, 'duration': 6}

    @patch('agnes.subprocess.check_output', return_value=b'{"streams":[{"width":1472,"height":2624}]}')
    def test_image_quota_is_recorded_and_enforced(self, _probe):
        pool = self.images()
        self.addCleanup(pool.db.close)
        result = {'data': [{'b64_json': base64.b64encode(b'\x89PNGtest').decode()}]}
        pool.generate('m', 0, 'prompt', self.root / 'images', lambda *a, **k: result)
        self.assertEqual(pool.db.execute('SELECT images FROM quota_use').fetchone()[0], 1)
        with patch.dict(os.environ, {'AGNES_DAILY_IMAGE_CAP': '1'}):
            with self.assertRaisesRegex(ValueError, 'cuota diaria de im\xe1genes'):
                pool.generate('m', 1, 'prompt', self.root / 'images', lambda *a, **k: self.fail('capped'))

    def test_video_quota_blocks_creation_and_records_seconds(self):
        pool = self.videos()
        self.addCleanup(pool.db.close)
        prompts, images = [{'prompt': 'Prompt 0'}], [{'url': 'https://example.org/image.jpg'}]
        posts = []

        def success(url, body=None, headers=None, timeout=None):
            if body:
                posts.append(body)
                return {'video_id': f'id-{len(posts)}'}
            return {'status': 'completed', 'url': 'https://example.org/clip.mp4'}

        result = pool.bank('a-b', prompts, images, self.root, 2000, 3000, call=success, download=self.download)
        self.assertEqual(len(result['clips']), 1)
        self.assertEqual(pool.db.execute('SELECT video_seconds FROM quota_use').fetchone()[0], 6)
        with patch.dict(os.environ, {'AGNES_DAILY_VIDEO_SECONDS_CAP': '6'}):
            capped = pool.bank('c-d', prompts, images, self.root, 2000, 3000, call=success, download=self.download)
            self.assertEqual(len(capped['clips']), 0)
            self.assertIn('cuota de v\xeddeo diaria', capped['failures'][0])
        self.assertEqual(len(posts), 1)

    def test_quota_ledger_is_shared_between_images_and_clips(self):
        image_pool = self.images()
        self.addCleanup(image_pool.db.close)
        video_pool = self.videos()
        self.addCleanup(video_pool.db.close)
        ensure_quota(image_pool.db)
        image_pool.db.execute("INSERT INTO quota_use VALUES('1970-01-01',2,12)")
        row = video_pool.db.execute('SELECT images, video_seconds FROM quota_use').fetchone()
        self.assertEqual((row[0], row[1]), (2, 12))


if __name__ == '__main__':
    unittest.main()
