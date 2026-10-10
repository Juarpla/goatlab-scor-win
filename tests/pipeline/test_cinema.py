import copy
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'fly/gateway/workspace/skills/goatlab/scripts'))
from planner import local_plan,validate,create_plan
from vision import review
from model_routes import routes
SOURCE={'planVersion':5,'span':12,'words':[{'word':w,'start':.5+i*.5,'end':.9+i*.5} for i,w in enumerate('La racha marca el partido y los goles cambian el rumbo de este duelo decisivo'.split())],'assets':[],'clips':[],'facts':[]}
class CinemaTests(unittest.TestCase):
    def test_empty_media_and_legacy_prompts_do_not_limit_topics(self):
        source={**SOURCE,'motionPrompts':[{'signature_move':str(i)} for i in range(10)]}
        plan=local_plan(source)
        self.assertEqual(plan['version'],5);validate(plan,source)
        self.assertEqual(plan['scenes'][-1]['end'],12)
    def test_repeated_distinctive_effect_counts_each_execution(self):
        source={**SOURCE,'words':[{'word':'racha','start':.5+i*.5,'end':.9+i*.5} for i in range(23)]}
        plan=local_plan(source)
        for s in plan['scenes']:s['distinctive']='slam'
        self.assertEqual(len(plan['scenes']),3)
        with self.assertRaisesRegex(ValueError,'dos'):validate(plan,source)
    def test_unknown_controls_and_invented_stats_rejected(self):
        for patch in [{'camera':'orbit'},{'factIds':['fake']},{'variant':'unknown'}]:
            plan=local_plan(SOURCE);plan['scenes'][0].update(patch)
            with self.assertRaises(ValueError):validate(plan,SOURCE)
    def test_all_four_routes_and_budget(self):
        now=[0];called=[]
        def call(url,body,headers,timeout):
            called.append(body['model']);now[0]+=timeout;raise TimeoutError()
        env={k:'test' for k in ['OPENCODE_GO_API_KEY','AGNES_API_KEY','MISTRAL_API_KEY']}
        plan=create_plan(SOURCE,env=env,call=call,clock=lambda:now[0])
        self.assertTrue(plan['fallback']);self.assertLessEqual(now[0],240)
        self.assertLessEqual(len(called),4)
    def test_vision_failover_and_unsupported_repair(self):
        calls=[]
        def call(url,body,headers,timeout):
            calls.append(body);answer={'severity':'ok','issues':[],'repair':{}} if len(calls)==2 else {'severity':'severe','issues':[],'repair':{'orbit':True}}
            return {'choices':[{'message':{'content':json.dumps(answer)}}]}
        answer=review({'frames':['data:image/jpeg;base64,x']},env={'OPENCODE_GO_API_KEY':'test'},call=call)
        self.assertEqual(answer['severity'],'ok');self.assertEqual(len(calls),2)
        self.assertEqual(calls[0]['messages'][0]['content'][1]['type'],'image_url')
    def test_provider_required(self):
        with self.assertRaises(ValueError):routes({'GOATLAB_PLANNER_MODELS':'mimo-v2.6-flash'})
