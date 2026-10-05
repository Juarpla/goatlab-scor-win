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
    def test_clip_plan_cannot_reference_an_unknown_clip_or_out_of_range_fragment(self):
        source={'span':4,'words':[{'word':'Datos','start':0,'end':1}],'assets':[],'clips':[{'duration':6}]}
        plan={'version':3,'scenes':[{'start':0,'end':4,'layers':[],'clips':[{'clip':0,'offset':0,'duration':4}]}]}
        validate(plan,source)
        plan['scenes'][0]['clips'][0]['offset']=4
        with self.assertRaises(ValueError):validate(plan,source)
        plan['scenes'][0]['clips'][0]['clip']=1
        with self.assertRaises(ValueError):validate(plan,source)
