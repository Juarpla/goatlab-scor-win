import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'fly/gateway/workspace/skills/goatlab/scripts'))
from content_client import ContentClient
from planner import validate

class ContentTests(unittest.TestCase):
    def test_valid_cache_survives_network_failure_but_wrong_match_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            data={'matchId':'a-b','home':'A','away':'B','scripts':[{'n':i+1,'narration':'Original'} for i in range(10)]}
            client=ContentClient(root,root,base='https://example.org',fetch=lambda url:data)
            self.assertEqual(client.get('a-b','scripts'),data)
            client.fetch=lambda url:{**data,'matchId':'wrong'}
            self.assertEqual(client.get('a-b','scripts'),data)
            self.assertIsNone(client.get('different','scripts'))

    @staticmethod
    def pack(category, kinds):
        prompt=('Vertical 9:16 referential composition with legible labels. '*8)
        rows=[{'n':i+1,'kind':k,'title':k,'prompt':prompt} for i,k in enumerate(kinds)]
        if category=='motion-prompts':
            for r in rows: r.update(factIds=[],presentations=['editorial','statistical'])
        return {'version':1,'category':category,'matchId':'a-b','home':'A','away':'B','facts':[],'prompts':rows}

    def test_prompt_contract_is_four_photos_two_clips_and_flexible_motion(self):
        from content_client import valid
        image=self.pack('image-prompts',['ball-duel','goal-action','supporters','stadium'])
        video=self.pack('video-prompts',['push-in','tracking'])
        motion=self.pack('motion-prompts',['goals','synthesis','form'])
        for category,data in [('image-prompts',image),('video-prompts',video),('motion-prompts',motion)]:
            self.assertTrue(valid(data,category,'a-b'), category)
        # El contrato antiguo (10 fotos / 5 clips) se rechaza: mismo fallo que rompió Croacia.
        old_image=self.pack('image-prompts',['ball-duel','pressing','passing','dribbling','crossing','defending','aerial-duel','goal-action','supporters','stadium'])
        self.assertFalse(valid(old_image,'image-prompts','a-b'))
        old_video=self.pack('video-prompts',['push-in','tracking','orbit','pull-out','focus-transition'])
        self.assertFalse(valid(old_video,'video-prompts','a-b'))
        self.assertFalse(valid(self.pack('motion-prompts',['form']),'motion-prompts','a-b'))
        self.assertFalse(valid(self.pack('motion-prompts',['form']*11),'motion-prompts','a-b'))
        self.assertFalse(valid(self.pack('motion-prompts',['form','invented']),'motion-prompts','a-b'))
    def test_clip_plan_cannot_reference_an_unknown_clip_or_out_of_range_fragment(self):
        source={'span':4,'words':[{'word':'Datos','start':0,'end':1}],'assets':[],'clips':[{'duration':6}]}
        plan={'version':3,'scenes':[{'start':0,'end':4,'layers':[],'clips':[{'clip':0,'offset':0,'duration':4}]}]}
        validate(plan,source)
        plan['scenes'][0]['clips'][0]['offset']=4
        with self.assertRaises(ValueError):validate(plan,source)
        plan['scenes'][0]['clips'][0]['clip']=1
        with self.assertRaises(ValueError):validate(plan,source)
