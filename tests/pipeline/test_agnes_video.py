import json
import io
import http.client
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'fly/gateway/workspace/skills/goatlab/scripts'))
from agnes_video import VideoPool
from fake_agnes_state import FakeAgnesState

class VideoTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.now=1000
        self.state=FakeAgnesState(lambda:self.now)
        self.pool=VideoPool(self.root/'agnes.sqlite',clock=lambda:self.now,sleep=self.sleep,state=self.state)
        self.addCleanup(self.pool.db.close)
        self.patch=patch.dict(os.environ,{'AGNES_API_KEY':'fake'});self.patch.start();self.addCleanup(self.patch.stop)
        self.prompts=[{'prompt':f'Prompt {i}'} for i in range(5)];self.images=[{'url':'https://example.org/image.jpg'}]
        self.posts=[]
    def sleep(self,seconds):self.now+=seconds
    def download(self,url,path,deadline):
        path.write_bytes(b'fixture')
        return {'path':str(path),'file':path.name,'width':720,'height':1280,'duration':6}
    def bank(self,call,**kwargs):return self.pool.bank('a-b',self.prompts,self.images,self.root,2000,3000,call=call,download=self.download,**kwargs)
    def success(self,url,body=None,headers=None,timeout=None):
        if body:self.posts.append(body);return {'video_id':f'id-{len(self.posts)}'}
        return {'status':'completed','url':'https://example.org/clip.mp4'}
    def test_concurrent_banks_do_not_duplicate_the_same_attempt(self):
        import fcntl
        lock_path = (self.root/'agnes.sqlite').with_suffix('.video.lock')
        holder = lock_path.open('w')
        self.addCleanup(holder.close)
        fcntl.flock(holder, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.addCleanup(lambda: fcntl.flock(holder, fcntl.LOCK_UN))
        result = self.bank(self.success)
        self.assertEqual(result['clips'], [])
        self.assertIn('otra generación en curso', result['failures'][0])
        self.assertEqual(len(self.posts), 0)

    def test_diagnostic_events_carry_attempt_stage_and_next_action(self):
        def rejected(url, body=None, **kwargs):
            raise urllib.error.HTTPError(url, 503, 'unavailable', {'X-Request-ID': 'req-9'}, io.BytesIO(b'{"error":"down"}'))
        result = self.bank(rejected)
        creates = [d for d in result['diagnostics'] if d['stage'] == 'create']
        self.assertTrue(creates)
        self.assertTrue(creates[0]['attemptId'])
        self.assertIn('siguiente intento permitido', creates[0]['next'])
        detail = '; '.join(result['failures'])
        self.assertIn('intento=', detail)
        self.assertIn('siguiente:', detail)

    def test_diagnostic_events_go_to_stderr_leaving_stdout_for_json(self):
        import contextlib
        err, out = io.StringIO(), io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            self.pool.diagnostic('a-b', 0, {'at': self.now, 'model': 'x', 'stage': 'create',
                'httpStatus': 503, 'body': 'down', 'requestId': '', 'videoId': None,
                'attemptId': 'attempt-1', 'next': 'reintentar'})
        self.assertIn('agnes-video:', err.getvalue())
        self.assertEqual(out.getvalue(), '')
        record = json.loads(err.getvalue().split('agnes-video: ', 1)[1])
        self.assertEqual(record['attemptId'], 'attempt-1')
        self.assertEqual(record['next'], 'reintentar')

    def test_nested_success_identifier_is_recovered(self):
        def call(url, body=None, **kwargs):
            if body:
                self.posts.append(body)
                return {'data': {'video_id': f'id-{len(self.posts)}'}}
            return {'status': 'completed', 'url': 'https://example.org/clip.mp4'}
        self.assertEqual(len(self.bank(call)['clips']), 2)

    def test_transport_detail_reaches_result_and_survives_restart(self):
        def lost(*args, **kwargs): raise TimeoutError('request timed out')
        first = self.bank(lost)
        self.assertIn('TimeoutError', '; '.join(first['failures']))
        second = self.bank(self.success)
        self.assertIn('TimeoutError', '; '.join(second['failures']))

    def test_http_detail_reaches_result_redacted(self):
        def rejected(url, body=None, **kwargs):
            raise urllib.error.HTTPError(url, 503, 'unavailable', {'X-Request-ID': 'req-42'}, io.BytesIO(b'{"error":"provider unavailable","token":"private-value"}'))
        result = self.bank(rejected)
        detail = '; '.join(result['failures'])
        self.assertIn('req-42', detail)
        self.assertIn('provider unavailable', detail)
        self.assertNotIn('private-value', detail)

    def test_only_missing_verified_clip_is_generated(self):
        result = self.bank(self.success, verified=['clip-0.mp4'])
        self.assertEqual(len(self.posts), 1)
        self.assertEqual(result['clips'][0]['file'], 'clip-1.mp4')
        self.bank(self.success, verified=['clip-0.mp4', 'clip-1.mp4'])
        self.assertEqual(len(self.posts), 1)

    def test_valid_id_survives_failed_remote_acceptance_and_fresh_sqlite(self):
        original = self.state.event
        def event(attempt, kind, **extra):
            if kind == 'accepted': raise ValueError('R2 unavailable')
            return original(attempt, kind, **extra)
        with patch.object(self.state, 'event', event):
            result = self.bank(self.success)
        self.assertEqual(len(self.posts), 1)
        self.assertIn('identificador guardado', result['failures'][0])
        restored = VideoPool(self.root/'fresh.sqlite',clock=lambda:self.now,sleep=self.sleep,state=self.state)
        self.addCleanup(restored.db.close)
        result = restored.bank('a-b',self.prompts,self.images,self.root,2000,3000,call=self.success,download=self.download)
        self.assertEqual(len(result['clips']), 2)
        self.assertEqual(len(self.posts), 2)

    def test_two_successes_are_shared_and_not_regenerated(self):
        first=self.bank(self.success);self.assertEqual(len(first['clips']),2);self.assertEqual(len(self.posts),2)
        second=self.bank(self.success);self.assertEqual(len(second['clips']),2);self.assertEqual(len(self.posts),2)
        self.assertGreaterEqual(self.now,1030)
    def test_lost_posts_are_archived_and_bounded_after_restart(self):
        def lost(url,body=None,headers=None,**kwargs):self.posts.append(body);raise TimeoutError()
        self.bank(lost)
        restored=VideoPool(self.root/'agnes.sqlite',clock=lambda:self.now,sleep=self.sleep,state=self.state);self.addCleanup(restored.db.close)
        result=restored.bank('a-b',self.prompts,self.images,self.root,2000,3000,call=self.success,download=self.download)
        self.assertEqual(len(self.posts),5);self.assertIn('cinco intentos',result['failures'][0])
    def test_confirmed_failures_use_remaining_prompts_at_most_five_tasks(self):
        def failed(url,body=None,headers=None,**kwargs):
            if body:self.posts.append(body);return {'video_id':f'id-{len(self.posts)}'}
            return {'status':'failed'}
        self.bank(failed);self.assertEqual(len(self.posts),5)
        self.bank(failed);self.assertEqual(len(self.posts),5)
    def test_known_pending_task_is_polled_without_another_post(self):
        self.pool.db.execute('INSERT INTO video_tasks VALUES(?,?,?,?,?,?,?,NULL)',('a-b',0,'pending','old-id','Prompt 0',self.images[0]['url'],3000))
        self.state.seed('a-b',0)
        self.bank(self.success);self.assertEqual(len(self.posts),1)
    def test_known_id_remains_recoverable_when_current_reference_changes(self):
        self.state.seed('a-b',0)
        self.prompts = [self.prompts[0]]
        self.images = [{'url':'https://example.org/new-image.jpg'}]
        result = self.bank(self.success)
        self.assertEqual(len(result['clips']),1)
        self.assertEqual(self.posts,[])
        self.assertEqual(result['clips'][0]['referenceHash'], self.state.status('a-b','video',0)['referenceHash'])
    def test_deadline_and_cancellation_do_not_create_tasks(self):
        self.now=2000;self.bank(self.success);self.assertEqual(self.posts,[])
        self.now=1000;self.bank(self.success,cancelled=lambda:True);self.assertEqual(self.posts,[])
    def test_rate_limit_persists_and_preserves_the_prompt(self):
        def limited(url,body=None,headers=None,**kwargs):self.posts.append(body);raise urllib.error.HTTPError(url,429,'limited',{'Retry-After':'120'},io.BytesIO(b'{"error":"rate limited"}'))
        self.pool.bank('a-b',self.prompts,self.images,self.root,1050,3000,call=limited,download=self.download);self.assertEqual(len(self.posts),1)
        self.assertEqual(self.pool.db.execute('SELECT status FROM video_tasks').fetchone()[0],'limited')
        self.bank(self.success);self.assertGreaterEqual(self.now,1120)

    def test_unproven_429_keeps_quota_and_consumes_distinct_attempts(self):
        cases = [
            (None, {}), (b'', {}), (b'{broken', {}), (b'[]', {}), (b'null', {}),
            (b'{"error":"limited"}' + b' ' * 4096, {}),
            (b'{"error":"limited"}', {'Content-Length':'400'}),
            (b'{"error":NaN}', {}), (b'{"error":"\xff"}', {}),
            (b'{"data":{"task_id":"known-task"}}', {}),
            (b'{"data":[{"resultId":"known-result"}]}', {}),
            (b'{"data":{"video_id":null}}', {}),
        ]
        for index, (body, headers) in enumerate(cases):
            with self.subTest(body=body):
                self.now=1000
                match_id = f'unproven-{index}'
                state = FakeAgnesState(lambda:self.now)
                pool = VideoPool(self.root/f'unproven-{index}.sqlite',clock=lambda:self.now,sleep=self.sleep,state=state)
                self.addCleanup(pool.db.close)
                posts = []
                def limited(url,body=None,**kwargs):
                    posts.append(body)
                    raise urllib.error.HTTPError(url,429,'limited',headers,None if response is None else io.BytesIO(response))
                response = body
                result = pool.bank(match_id,self.prompts,self.images,self.root,2000,3000,call=limited,download=self.download)
                row = state.status(match_id,'video',0)
                self.assertEqual(row['state'],'abandoned')
                self.assertFalse(row['refunded'])
                self.assertEqual(state.quota[row['day']]['video_seconds'],30)
                self.assertEqual(pool.db.execute('SELECT status FROM video_tasks').fetchone()[0],'abandoned')
                self.assertIn('HTTP 429',result['failures'][0])
                pool.bank(match_id,self.prompts,self.images,self.root,2000,3000,call=self.success,download=self.download)
                self.assertEqual(len(posts),5)

    def test_unreadable_or_short_body_does_not_prove_rejection(self):
        class Unreadable(io.BytesIO):
            def read(self, size=-1):
                raise http.client.IncompleteRead(b'{"error":"limited"}', 30)
        class ShortRead(io.BytesIO):
            def read(self, size=-1):
                if self.tell() == 0:
                    return super().read(len(b'{"error":"limited"}'))
                return super().read(size)
        for stream in [Unreadable(), ShortRead(b'{"error":"limited"} trailing')]:
            with self.subTest(stream=type(stream).__name__):
                error = urllib.error.HTTPError('https://example.org',429,'limited',{},stream)
                status, _, video_id, rejected = self.pool.error('a-b',0,'create',error)
                self.assertEqual(status,429)
                self.assertIsNone(video_id)
                self.assertFalse(rejected)

    def test_nested_video_id_in_429_is_polled_without_refund_or_duplicate_post(self):
        self.prompts = [self.prompts[0]]
        polls = []
        def call(url,body=None,**kwargs):
            if body:
                self.posts.append(body)
                raise urllib.error.HTTPError(url,429,'limited',{},io.BytesIO(b'{"data":{"videoId":"nested-id"}}'))
            polls.append(url)
            return {'status':'completed','url':'https://example.org/clip.mp4'}
        result = self.bank(call)
        self.assertEqual(len(self.posts),1)
        self.assertEqual(len(result['clips']),1)
        self.assertIn('video_id=nested-id&',polls[0])
        row = self.state.status('a-b','video',0)
        self.assertFalse(row['refunded'])
        self.assertEqual(self.state.quota[row['day']]['video_seconds'],6)
        self.bank(self.success)
        self.assertEqual(len(self.posts),1)

    def test_confirmed_failure_advances_image_and_prompt_and_only_flash(self):
        images=[{'url':f'https://example.org/{i}.jpg'} for i in range(5)]
        def call(url,body=None,**kwargs):
            if body: self.posts.append(body);return {'video_id':f'id-{len(self.posts)}'}
            return {'status':'failed'} if 'id-1&' in url else {'status':'completed','url':'https://example.org/clip.mp4'}
        result=self.pool.bank('a-b',self.prompts,images,self.root,2000,3000,call=call,download=self.download)
        self.assertEqual(len(result['clips']),2)
        self.assertEqual([p['images'][0] for p in self.posts],[i['url'] for i in images[:3]])
        self.assertEqual([p['prompt'].split('reference. ')[1] for p in self.posts],[p['prompt'] for p in self.prompts[:3]])
        self.assertTrue(all(p['model']=='agnes-video-2.5-flash' and p['mode']=='reference' for p in self.posts))
        self.assertEqual(self.pool.db.execute('select count(*) from video_models').fetchone()[0],3)

    def test_few_images_are_exhausted_before_reuse(self):
        images=[{'url':f'https://example.org/{i}.jpg'} for i in range(2)]
        def call(url,body=None,**kwargs):
            if body: self.posts.append(body);return {'video_id':f'id-{len(self.posts)}'}
            return {'status':'failed'}
        self.pool.bank('a-b',self.prompts,images,self.root,2000,3000,call=call,download=self.download)
        self.assertEqual([p['images'][0] for p in self.posts],[images[i%2]['url'] for i in range(5)])

    def test_503_without_id_is_redacted_bounded_and_does_not_block_other_matches(self):
        def unavailable(url,body=None,**kwargs):
            self.posts.append(body)
            raise urllib.error.HTTPError(url,503,'unavailable',{'X-Request-ID':'req-1'},io.BytesIO(b'{"detail":"Bearer fake-secret","api_key":"fake-secret","url":"https://example.org/x?sig=secret"}'))
        with patch.dict(os.environ,{'AGNES_API_KEY':'fake-secret'}): result=self.bank(unavailable)
        self.assertEqual(len(self.posts),5);self.assertGreaterEqual(self.now,1120)
        event=json.loads(self.pool.db.execute('select metadata from video_errors').fetchone()[0])
        self.assertEqual(event['httpStatus'],503);self.assertEqual(event['requestId'],'req-1');self.assertEqual(event['stage'],'create')
        self.assertNotIn('fake-secret',event['body']);self.assertNotIn('sig=secret',event['body'])
        self.bank(self.success);self.assertEqual(len(self.posts),5)
        self.pool.bank('other',self.prompts,self.images,self.root,2000,3000,call=self.success,download=self.download)
        self.assertEqual(len(self.posts),7)

    def test_known_task_recovery_is_bounded_per_run_and_can_resume_after_restart(self):
        self.pool.db.execute('INSERT INTO video_tasks VALUES(?,?,?,?,?,?,?,NULL)',('a-b',0,'pending','old-id','Prompt 0',self.images[0]['url'],3000))
        self.state.seed('a-b',0)
        calls=[]
        def unavailable(url,**kwargs): calls.append(url);raise urllib.error.HTTPError(url,503,'unavailable',{},io.BytesIO(b'{"detail":"temporary"}'))
        self.bank(unavailable)
        self.assertLessEqual(self.now,1060);self.assertGreaterEqual(self.now,1058)
        recovery=self.pool.db.execute('select deadline from video_recovery').fetchone()[0]
        restored=VideoPool(self.root/'agnes.sqlite',clock=lambda:self.now,sleep=self.sleep,state=self.state);self.addCleanup(restored.db.close)
        self.now=1061;before=len(calls)
        restored.bank('a-b',self.prompts,self.images,self.root,2000,3000,call=unavailable,download=self.download)
        self.assertGreater(len(calls),before);self.assertLessEqual(self.now,1121)
        self.assertGreater(restored.db.execute('select deadline from video_recovery').fetchone()[0],recovery)

    def test_recovery_can_succeed_and_following_healthy_tasks_continue(self):
        self.pool.db.execute('INSERT INTO video_tasks VALUES(?,?,?,?,?,?,?,NULL)',('a-b',0,'pending','old-id','Prompt 0',self.images[0]['url'],3000))
        self.state.seed('a-b',0)
        polls=[]
        def call(url,body=None,**kwargs):
            if body: self.posts.append(body);return {'video_id':f'id-{len(self.posts)}'}
            polls.append(url)
            if len(polls)==1: raise urllib.error.HTTPError(url,503,'unavailable',{},io.BytesIO(b'{}'))
            return {'status':'completed','url':'https://example.org/clip.mp4'}
        self.assertEqual(len(self.bank(call)['clips']),2)
        self.assertEqual(len(self.posts),1)
        self.assertTrue(all('model_name=agnes-video-2.5-flash' in url for url in polls))

    def test_creation_error_with_task_id_is_recovered_without_reposting_pair(self):
        def call(url,body=None,**kwargs):
            if body:
                self.posts.append(body)
                if len(self.posts)==1: raise urllib.error.HTTPError(url,503,'unavailable',{},io.BytesIO(b'{"video_id":"known-id"}'))
                return {'video_id':f'id-{len(self.posts)}'}
            return {'status':'completed','url':'https://example.org/clip.mp4'}
        self.assertEqual(len(self.bank(call)['clips']),2);self.assertEqual(len(self.posts),2)

    def test_polling_retry_after_does_not_extend_recovery(self):
        self.pool.db.execute('INSERT INTO video_tasks VALUES(?,?,?,?,?,?,?,NULL)',('a-b',0,'pending','old-id','Prompt 0',self.images[0]['url'],3000))
        self.state.seed('a-b',0)
        def limited(url,**kwargs): raise urllib.error.HTTPError(url,429,'limited',{'Retry-After':'120'},io.BytesIO(b'{}'))
        result=self.bank(limited)
        self.assertEqual(self.now,1000);self.assertEqual(len(result['clips']),0)
        self.assertEqual(self.pool.db.execute('select deadline from video_recovery').fetchone()[0],1060)
        def forbidden(*args,**kwargs): raise AssertionError('Retry-After aún vigente')
        self.bank(forbidden)
        self.pool.bank('other',self.prompts,self.images,self.root,2000,3000,call=forbidden,download=self.download)

    def test_malformed_creation_response_uses_at_most_five_attempts(self):
        def malformed(url,body=None,**kwargs): self.posts.append(body);return []
        self.bank(malformed);self.bank(self.success);self.assertEqual(len(self.posts),5)
