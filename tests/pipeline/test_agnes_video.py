import json
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'fly/gateway/workspace/skills/goatlab/scripts'))
from agnes_video import VideoPool

class VideoTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.now=1000
        self.pool=VideoPool(self.root/'agnes.sqlite',clock=lambda:self.now,sleep=self.sleep)
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
    def test_three_successes_are_shared_and_not_regenerated(self):
        first=self.bank(self.success);self.assertEqual(len(first['clips']),3);self.assertEqual(len(self.posts),3)
        second=self.bank(self.success);self.assertEqual(len(second['clips']),3);self.assertEqual(len(self.posts),3)
        self.assertGreaterEqual(self.now,1120)
    def test_lost_post_is_not_repeated_after_restart(self):
        def lost(url,body=None,headers=None,**kwargs):self.posts.append(body);raise TimeoutError()
        self.bank(lost)
        restored=VideoPool(self.root/'agnes.sqlite',clock=lambda:self.now,sleep=self.sleep);self.addCleanup(restored.db.close)
        result=restored.bank('a-b',self.prompts,self.images,self.root,2000,3000,call=self.success,download=self.download)
        self.assertEqual(len(self.posts),1);self.assertIn('incierta',result['failures'][0])
    def test_confirmed_failures_use_remaining_prompts_at_most_five_tasks(self):
        def failed(url,body=None,headers=None,**kwargs):
            if body:self.posts.append(body);return {'video_id':f'id-{len(self.posts)}'}
            return {'status':'failed'}
        self.bank(failed);self.assertEqual(len(self.posts),5)
        self.bank(failed);self.assertEqual(len(self.posts),5)
    def test_known_pending_task_is_polled_without_another_post(self):
        self.pool.db.execute('INSERT INTO video_tasks VALUES(?,?,?,?,?,?,?,NULL)',('a-b',0,'pending','old-id','Prompt 0',self.images[0]['url'],3000))
        self.bank(self.success);self.assertEqual(len(self.posts),2)
    def test_deadline_and_cancellation_do_not_create_tasks(self):
        self.now=2000;self.bank(self.success);self.assertEqual(self.posts,[])
        self.now=1000;self.bank(self.success,cancelled=lambda:True);self.assertEqual(self.posts,[])
    def test_rate_limit_persists_and_preserves_the_prompt(self):
        def limited(url,body=None,headers=None,**kwargs):self.posts.append(body);raise urllib.error.HTTPError(url,429,'limited',{'Retry-After':'120'},None)
        self.bank(limited);self.assertEqual(len(self.posts),1)
        self.assertEqual(self.pool.db.execute('SELECT status FROM video_tasks').fetchone()[0],'limited')
        self.bank(self.success);self.assertGreaterEqual(self.now,1120)
