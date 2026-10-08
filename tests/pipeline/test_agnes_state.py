import base64
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'fly/gateway/workspace/skills/goatlab/scripts'))
from agnes_state import AgnesState
from agnes import ImagePool
from agnes_video import VideoPool
from fake_agnes_state import FakeAgnesState


class AdapterTests(unittest.TestCase):
    def test_reserve_failure_never_retries_or_returns_a_paid_permission(self):
        requests=[]
        def runner(argv, **kwargs):
            requests.append((argv, kwargs))
            return SimpleNamespace(returncode=1, stdout=json.dumps({'ok':False,'reason':'PUT incierto'}))
        state=AgnesState(env={'R2_STATE_SECRET_ACCESS_KEY':'private-secret'},run=runner)
        with self.assertRaisesRegex(ValueError,'incierto'):
            state.call('reserve', {'attemptId':'stable'})
        self.assertEqual(len(requests),1)
        self.assertNotIn('private-secret', requests[0][0])

    def test_events_retry_with_the_same_id_but_reservations_do_not(self):
        ids=[]
        def runner(argv, **kwargs):
            ids.append(json.loads(kwargs['input'])['eventId'])
            return SimpleNamespace(returncode=0 if len(ids)==2 else 1, stdout=json.dumps({'ok':len(ids)==2}))
        AgnesState(env={},run=runner).event('attempt','completed')
        self.assertEqual(len(ids),2);self.assertEqual(ids[0],ids[1])

    def test_batch_guard_refetches_after_60_seconds_and_closes_on_failed_fetch(self):
        with tempfile.TemporaryDirectory() as root:
            match={'id':'a-b','webId':'a-b','home':'Alpha','away':'Beta','competition':'League','kickoff':'2026-10-09T12:00:00Z','status':'NS'}
            guard=Path(root)/'guard.json';guard.write_text(json.dumps(match))
            now=[1791525600];fetches=[];fail=[False]
            def runner(argv, **kwargs):
                if argv[1]=='fetch':fetches.append(argv);return SimpleNamespace(returncode=int(fail[0]),stdout='')
                return SimpleNamespace(returncode=0,stdout=json.dumps({'matches':[match]}))
            state=AgnesState(env={'AGNES_GUARD_FILE':str(guard),'GOATLAB_REPO':root},run=runner,clock=lambda:now[0])
            state.guard('a-b',now[0]+86400);state.guard('a-b',now[0]+86400)
            self.assertEqual(len(fetches),1)
            now[0]+=61;fail[0]=True
            with self.assertRaisesRegex(ValueError,'vigente'):state.guard('a-b',now[0]+86400)
            self.assertEqual(len(fetches),2)


class DurablePoolTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.now=1000
        self.state=FakeAgnesState(lambda:self.now)
        self.patch=patch.dict(os.environ,{'AGNES_API_KEY':'fake'});self.patch.start();self.addCleanup(self.patch.stop)

    def sleep(self,seconds):self.now+=seconds

    def test_deleted_sqlite_cannot_repeat_an_uncertain_image_or_video(self):
        posts=[]
        def lost(*args,**kwargs):posts.append(args);raise TimeoutError()
        image=ImagePool(self.root/'image.sqlite',clock=lambda:self.now,sleep=self.sleep,state=self.state)
        with self.assertRaises(ValueError):image.generate('image-match',0,'prompt',self.root/'images',lost)
        image.db.close();(self.root/'image.sqlite').unlink();shutil.rmtree(self.root/'images')
        image=ImagePool(self.root/'image.sqlite',clock=lambda:self.now,sleep=self.sleep,state=self.state);self.addCleanup(image.db.close)
        with self.assertRaisesRegex(ValueError,'incierto'):image.generate('image-match',0,'prompt',self.root/'images',lost)
        video=VideoPool(self.root/'video.sqlite',clock=lambda:self.now,sleep=self.sleep,state=self.state)
        video.bank('video-match',[{'prompt':'prompt'}],[{'url':'https://example.org/0.jpg'}],self.root,2000,3000,call=lost)
        video.db.close();(self.root/'video.sqlite').unlink()
        video=VideoPool(self.root/'video.sqlite',clock=lambda:self.now,sleep=self.sleep,state=self.state);self.addCleanup(video.db.close)
        video.bank('video-match',[{'prompt':'prompt'}],[{'url':'https://example.org/0.jpg'}],self.root,2000,3000,call=lost)
        self.assertEqual(len(posts),2)
        self.assertEqual(self.state.quota['1970-01-01'],{'images':1,'video_seconds':6})

    def test_known_completed_clip_recovers_after_sqlite_loss_without_another_post(self):
        posts=[]
        def provider(url,body=None,**kwargs):
            if body:posts.append(body);return {'video_id':'stable-video'}
            return {'status':'completed','url':'https://example.org/clip.mp4'}
        pool=VideoPool(self.root/'video.sqlite',clock=lambda:self.now,sleep=self.sleep,state=self.state)
        def interrupted(*args):raise OSError('lost download')
        pool.bank('m',[{'prompt':'prompt'}],[{'url':'https://example.org/0.jpg'}],self.root,1001,3000,call=provider,download=interrupted)
        pool.db.close();(self.root/'video.sqlite').unlink();self.now=1002
        pool=VideoPool(self.root/'video.sqlite',clock=lambda:self.now,sleep=self.sleep,state=self.state);self.addCleanup(pool.db.close)
        def download(url,path,deadline):path.write_bytes(b'fixture');return {'path':str(path),'file':path.name,'duration':6,'width':720,'height':1280}
        result=pool.bank('m',[{'prompt':'prompt'}],[{'url':'https://example.org/0.jpg'}],self.root,2000,3000,call=provider,download=download)
        self.assertEqual(len(posts),1);self.assertEqual(len(result['clips']),1)
        self.assertEqual(self.state.quota['1970-01-01']['video_seconds'],6)

    def test_image_429_with_identifier_is_not_refunded_or_retried(self):
        calls=[]
        def limited(*args,**kwargs):calls.append(1);raise urllib.error.HTTPError('https://test',429,'limited',{},io.BytesIO(b'{"id":"accepted-image"}'))
        pool=ImagePool(self.root/'image.sqlite',clock=lambda:self.now,sleep=self.sleep,state=self.state);self.addCleanup(pool.db.close)
        with self.assertRaisesRegex(ValueError,'incierto'):pool.generate('m',0,'prompt',self.root,limited)
        self.assertEqual(len(calls),1);self.assertEqual(self.state.quota['1970-01-01']['images'],1)

    def test_two_published_prompts_advance_to_third_ordinal_after_confirmed_failure(self):
        calls=[]
        def provider(url,body=None,**kwargs):
            if body:calls.append(body);return {'video_id':f'v-{len(calls)}'}
            return {'status':'failed'} if 'v-1&' in url else {'status':'completed','url':'https://example.org/clip.mp4'}
        def download(url,path,deadline):path.write_bytes(b'x');return {'path':str(path),'file':path.name,'duration':6}
        pool=VideoPool(self.root/'video.sqlite',clock=lambda:self.now,sleep=self.sleep,state=self.state);self.addCleanup(pool.db.close)
        result=pool.bank('m',[{'prompt':'one'},{'prompt':'two'}],[{'url':'https://example.org/0.jpg'}],self.root,2000,3000,call=provider,download=download)
        self.assertEqual(len(calls),3);self.assertEqual(len(result['clips']),2)
        self.assertEqual(self.state.quota['1970-01-01']['video_seconds'],18)
