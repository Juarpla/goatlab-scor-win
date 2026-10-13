"""Per-run resource admission and provider waiting, without real paid requests."""
import base64
import io
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'fly/gateway/workspace/skills/goatlab/scripts'))
from agnes import ImagePool
from agnes_video import VideoPool
from fake_agnes_state import FakeAgnesState

class ResourceRetries(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.now = 1000
        self.state = FakeAgnesState(lambda: self.now)
        self.env = patch.dict(os.environ, {'AGNES_API_KEY': 'fake', 'AGNES_RESOURCE_RETRIES': '3'})
        self.env.start(); self.addCleanup(self.env.stop)
        self.prompts = [{'prompt': f'Prompt {i}'} for i in range(5)]
        self.images = [{'url': 'https://example.org/image.jpg'}]
        self.posts = []
    def sleep(self, seconds): self.now += seconds
    def pool(self):
        pool = VideoPool(self.root / 'video.sqlite', clock=lambda: self.now, sleep=self.sleep, state=self.state)
        self.addCleanup(pool.db.close)
        return pool
    def download(self, url, path, deadline):
        path.write_bytes(b'video')
        return {'path': str(path), 'file': path.name, 'width': 720, 'height': 1280, 'duration': 6}
    def bank(self, pool, call, **kwargs):
        return pool.bank('a-b', self.prompts, self.images, self.root, self.now+1000, 5000,
                         call=call, download=self.download, **kwargs)
    def rejected(self, code):
        def call(url, body=None, headers=None, **kwargs):
            if body is not None: self.posts.append(body)
            raise urllib.error.HTTPError(url, code, 'rejected', {}, io.BytesIO(b'{"code":"video_queue_full"}'))
        return call
    def test_503_stops_each_clip_and_next_run_resets(self):
        pool = self.pool()
        result = self.bank(pool, self.rejected(503))
        self.assertEqual(len(self.posts), 2)
        self.assertEqual(result['runPosts'], {'1': 1, '2': 1})
        self.assertNotIn('5/5', '; '.join(result['failures']))
        self.bank(self.pool(), self.rejected(503))
        self.assertEqual(len(self.posts), 4)
    def test_three_posts_per_clip_without_accumulated_budget(self):
        result = self.bank(self.pool(), self.rejected(500))
        self.assertEqual(len(self.posts), 6)
        self.assertEqual(result['runPosts'], {'1': 3, '2': 3})
        self.bank(self.pool(), self.rejected(500))
        self.assertEqual(len(self.posts), 12)
    def test_old_five_failures_do_not_block_new_run(self):
        for i in range(5):
            self.state.seed('a-b', i, prompt=f'Prompt {i}')
            self.state.event(self.state.status('a-b', 'video', i)['attemptId'], 'failed')
        self.bank(self.pool(), self.rejected(503))
        self.assertEqual(len(self.posts), 2)
    def test_pending_waits_beyond_sixty_seconds_with_same_id(self):
        self.state.seed('a-b', 0)
        queried = []
        def call(url, body=None, **kwargs):
            self.assertIsNone(body)
            queried.append(self.now)
            return {'status': 'pending', 'progress': 0} if len(queried)<5 else {'status': 'completed', 'url': 'https://example.org/v.mp4'}
        result = self.bank(self.pool(), call, verified=['clip-1.mp4'])
        self.assertEqual(len(result['clips']), 1)
        self.assertEqual([b-a for a,b in zip(queried,queried[1:])], [15,40,75,90])
        self.assertEqual(result['runPosts'], {})
    def test_failed_task_retries_same_resource_up_to_three(self):
        def call(url, body=None, **kwargs):
            if body is not None:
                self.posts.append(body); return {'video_id': f'vid-{len(self.posts)}'}
            return {'status': 'failed'}
        result = self.bank(self.pool(), call)
        self.assertEqual(len(self.posts), 6)
        self.assertEqual(result['runPosts'], {'1': 3, '2': 3})
    def test_image_503_only_once_and_three_other_failures(self):
        pool = ImagePool(self.root/'images.sqlite', clock=lambda:self.now, sleep=self.sleep, state=self.state)
        self.addCleanup(pool.db.close)
        with self.assertRaisesRegex(ValueError, '503'):
            pool.generate('images', 0, 'prompt', self.root/'img', self.rejected(503))
        self.assertEqual(len(self.posts), 1)
        with self.assertRaisesRegex(ValueError, 'tres POST'):
            pool.generate('images', 1, 'prompt', self.root/'img', self.rejected(500))
        self.assertEqual(len(self.posts), 4)
    @patch('agnes.subprocess.check_output', return_value=b'{"streams":[{"width":1472,"height":2624}]}')
    def test_lost_completed_image_regenerates_with_empty_sqlite(self, probe):
        previous = self.state.reserve('images', 'image', 0, 'prompt', 'agnes-image-2.5-flash', 5000)
        self.state.event(previous['attemptId'], 'completed')
        pool = ImagePool(self.root/'empty.sqlite', clock=lambda:self.now, sleep=self.sleep, state=self.state)
        self.addCleanup(pool.db.close)
        def call(*args, **kwargs):
            self.posts.append(args)
            return {'data':[{'b64_json':base64.b64encode(b'\x89PNGtest').decode()}]}
        saved = pool.generate('images', 0, 'prompt', self.root/'img', call)
        self.assertTrue(Path(saved['path']).exists())
        self.assertEqual(len(self.posts), 1)
        self.assertEqual(len(self.state.attempts), 2)
    def test_429_cannot_exceed_three_posts_per_clip(self):
        self.bank(self.pool(), self.rejected(429))
        self.assertEqual(len(self.posts), 6)
    def test_uncertain_creation_does_not_repeat_post_in_same_run(self):
        def call(url, body=None, **kwargs):
            if body is not None: self.posts.append(body)
            raise TimeoutError('unknown response')
        self.bank(self.pool(), call)
        self.assertEqual(len(self.posts), 2)
    def test_503_stays_stopped_in_same_pool(self):
        pool = self.pool()
        self.bank(pool, self.rejected(503))
        self.bank(pool, self.rejected(503))
        self.assertEqual(len(self.posts), 2)
    def test_known_failed_resource_keeps_its_position_with_legacy_slots(self):
        self.state.seed('a-b', 3, prompt='Prompt 3')
        row=self.state.status('a-b','video',3); row['publicationIndex']=1
        self.state.event(row['attemptId'],'failed')
        pool=self.pool()
        self.bank(pool,self.rejected(503))
        self.assertEqual(self.state.status('a-b','video',3)['publicationIndex'],1)
        self.assertEqual(len(self.posts),2)
    def test_real_http_adapter_counts_all_posts_and_limits_them(self):
        from common import request_json
        requests=[]
        def unavailable(request, **kwargs):
            requests.append(request)
            raise urllib.error.HTTPError(request.full_url,500,'busy',{},io.BytesIO(b'{"code":"busy"}'))
        with patch('common.urllib.request.urlopen',unavailable):
            result=self.bank(self.pool(),request_json)
        self.assertEqual(len(requests),6)
        self.assertEqual(result['runPosts'],{'1':3,'2':3})
