import copy
import json
import sys
import unittest
import threading
import urllib.error
import io
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'fly/gateway/workspace/skills/goatlab/scripts'))
from planner import create_plan, validate, local_plan


SOURCE = {'span': 5, 'words': [{'word': 'Ganó', 'start': .5, 'end': 1}, {'word': 'tres', 'start': 1, 'end': 1.4}],
          'assets': [{'index': 0}, {'index': 1}], 'variant': 0}
PLAN = {'version': 1, 'scenes': [{'start': 0, 'end': 5, 'layers': [{'asset': 0}],
        'graphics': [{'kind': 'stat', 'at': .5, 'duration': 2, 'wordStart': 0, 'wordEnd': 2}]}]}


class PlannerTests(unittest.TestCase):
    def test_local_titles_follow_sentence_boundaries_and_skip_connectives(self):
        words=[{'word':w,'start':.5+i*.35,'end':.8+i*.35} for i,w in enumerate(['El','espacio','cambia','el','partido.','Pero','nadie','lo','aprovecha.'])]
        source={**SOURCE,'span':4,'words':words,'assets':[]}
        plan=local_plan(source)
        title=next(g for g in plan['scenes'][0]['graphics'] if g['kind']=='title')
        phrase=' '.join(w['word'] for w in words[title['wordStart']:title['wordEnd']])
        self.assertEqual(phrase,'espacio cambia el partido.')
        validate(plan,source)

    def test_real_http_transport_sends_stable_session_and_client_identity(self):
        requests = []
        class Provider(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                session = self.headers.get('x-opencode-session')
                requests.append((session, self.headers.get('User-Agent'), body['model']))
                self.send_response(200 if session else 400)
                self.end_headers()
                plan = PLAN if body['model'] == 'backup' else {'version': 1, 'scenes': []}
                self.wfile.write(json.dumps({'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(plan)}}]}).encode())
        server = HTTPServer(('127.0.0.1', 0), Provider)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close); self.addCleanup(server.shutdown)
        env = {'OPENCODE_GO_API_KEY': 'test', 'OPENCODE_GO_MODEL': 'primary', 'OPENCODE_GO_FALLBACK_MODEL': 'backup',
               'OPENCODE_GO_BASE_URL': f'http://127.0.0.1:{server.server_port}'}
        for _ in range(2):
            result = create_plan({**SOURCE, 'requestId': 'stable-job'}, env=env)
            self.assertEqual(result['model'], 'backup')
        self.assertEqual(len({r[0] for r in requests}), 1)
        self.assertTrue(requests[0][0])
        self.assertTrue(all(r[1].startswith('GoatLab/') for r in requests))

    def test_rejects_invalid_assets_gaps_and_unfounded_graphics(self):
        for mutation in [lambda p: p['scenes'][0].update(start=1),
                         lambda p: p['scenes'][0]['layers'][0].update(asset=2),
                         lambda p: p['scenes'][0]['graphics'][0].update(wordEnd=99),
                         lambda p: p['scenes'][0]['layers'][0].update(to={'scale': float('nan')})]:
            plan = copy.deepcopy(PLAN)
            mutation(plan)
            with self.assertRaises(ValueError):
                validate(plan, SOURCE)

    def test_graphic_text_is_always_derived_from_voice(self):
        plan = copy.deepcopy(PLAN)
        plan['scenes'][0]['graphics'][0].update(text='inventado', value=99)
        result = validate(plan, SOURCE)
        self.assertNotIn('text', result['scenes'][0]['graphics'][0])
        self.assertNotIn('value', result['scenes'][0]['graphics'][0])

    def test_one_repair_then_fallback(self):
        calls = []
        def call(url, body, headers, timeout):
            calls.append(body)
            plan = PLAN if body['model'] == 'backup' else {'version': 1, 'scenes': []}
            return {'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(plan)}}]}
        result = create_plan(SOURCE, call=call, env={'OPENCODE_GO_API_KEY': 'test', 'OPENCODE_GO_MODEL': 'primary', 'OPENCODE_GO_FALLBACK_MODEL': 'backup'})
        self.assertEqual([c['model'] for c in calls], ['primary', 'primary', 'backup'])
        self.assertEqual(result['model'], 'backup')
        self.assertIn('Corrige', calls[1]['messages'][-1]['content'])

    def test_empty_transcript_blocks_provider_call(self):
        with self.assertRaises(ValueError):
            create_plan({**SOURCE, 'words': []}, call=lambda *_: self.fail('must not call'))

    def test_http_status_is_preserved_and_both_models_use_validated_local_plan(self):
        calls,logs=[],[]
        def denied(url,body,headers,timeout):
            calls.append(body['model'])
            raise urllib.error.HTTPError(url,400,'bad request',{},io.BytesIO(b'private prompt'))
        result=create_plan(SOURCE,call=denied,env={'OPENCODE_GO_API_KEY':'test'},logger=logs.append)
        self.assertTrue(result['fallback']);validate(result,SOURCE)
        self.assertIn('HTTP 400',result['fallbackReason'])
        self.assertEqual(len(calls),2)
        self.assertNotIn('private prompt',result['fallbackReason'])
        self.assertTrue(all(log['httpStatus']==400 for log in logs))

    def test_shared_time_budget_reserves_fallback_and_never_exceeds_240_seconds(self):
        now=[0];calls=[]
        def slow(url,body,headers,timeout):
            calls.append((body['model'],timeout));now[0]+=timeout
            return {'choices':[{'message':{'content':'{}'}}]}
        result=create_plan(SOURCE,call=slow,env={'OPENCODE_GO_API_KEY':'test'},clock=lambda:now[0])
        self.assertTrue(result['fallback'])
        self.assertEqual(now[0],240)
        self.assertTrue(all(timeout<=90 for _,timeout in calls))
        self.assertIn('mimo-v2.6-flash',[model for model,_ in calls])

    def test_motion_scenes_and_catalog_charts_validate_without_photo_layers(self):
        plan=copy.deepcopy(PLAN);plan['version']=2
        scene=plan['scenes'][0];scene['layers']=[];scene['transition']='focus'
        scene['objects']=[{'kind':'cube','size':200,'spin':70}]
        scene['graphics']=[{'kind':'bars','at':0,'duration':3,'factIds':['home.gf','away.gf']}]
        facts=[{'id':side+'.gf','label':side,'value':n,'unit':'goles','source':'fixtures:a-b'} for side,n in [('home',3),('away',1)]]
        validate(plan,{**SOURCE,'facts':facts})
        with self.assertRaisesRegex(ValueError,'unidades'):
            validate(plan,{**SOURCE,'facts':[facts[0],{**facts[1],'unit':'partidos'}]})
        scene['graphics'][0]['factIds']=['invented']
        with self.assertRaisesRegex(ValueError,'inexistente'):validate(plan,{**SOURCE,'facts':facts})

    def test_local_montage_covers_voice_with_zero_one_and_fifteen_images(self):
        from planner import local_plan
        for n in (0,1,15):
            source={**SOURCE,'span':24,'assets':[{'index':i} for i in range(n)]}
            plan=local_plan(source);validate(plan,source)
            self.assertTrue(any(not s['layers'] and s['objects'] for s in plan['scenes']))
            self.assertEqual(sum(s['end']-s['start'] for s in plan['scenes']),24)
            if n:self.assertTrue(any(s['layers'] for s in plan['scenes']))


class MotionPlanTests(unittest.TestCase):
    def test_version_four_binds_prompt_facts_and_voice(self):
        source={**SOURCE,'planVersion':4,'motionPrompts':[{'n':2,'kind':'goals','factIds':['home.gf']}],
                'facts':[{'id':'home.gf','label':'Alpha goles','value':3,'unit':'goles','source':'fixtures:a-b'}]}
        plan={'version':4,'scenes':[{'start':0,'end':5,'layers':[], 'graphics':[{'kind':'goals','motionPromptNumber':2,
                'factIds':['home.gf'],'wordStart':0,'wordEnd':2,'at':.5,'duration':4}]}]}
        validate(copy.deepcopy(plan),source)
        for changes in [{'factIds':['away.gf']},{'motionPromptNumber':1},{'wordStart':99}]:
            invalid=copy.deepcopy(plan);invalid['scenes'][0]['graphics'][0].update(changes)
            with self.assertRaises(ValueError): validate(invalid,source)
        missing=copy.deepcopy(plan);missing['scenes'][0]['graphics'][0]['factIds']=[]
        validate(missing,{**source,'facts':[],'motionPrompts':[{'n':2,'kind':'goals','factIds':[]}]})
    def test_local_fallback_uses_relevant_public_direction(self):
        source={**SOURCE,'planVersion':4,'words':[{'word':'Goles','start':.5,'end':1}],
                'motionPrompts':[{'n':2,'kind':'goals','factIds':[]}], 'assets':[]}
        plan=local_plan(source)
        self.assertEqual(plan['version'],4)
        self.assertEqual(plan['scenes'][0]['graphics'][0]['kind'],'goals')

    def test_local_goals_excludes_sample_size_from_comparison(self):
        source={**SOURCE,'planVersion':4,'words':[{'word':'Goles','start':.5,'end':1}],
                'facts':[{'id':'home.gf','label':'Goles','value':8,'unit':'goles','source':'fixtures'}, {'id':'home.n','label':'Muestra','value':5,'unit':'partidos','source':'fixtures'}],
                'motionPrompts':[{'n':2,'kind':'goals','factIds':['home.gf','home.n']}], 'assets':[]}
        plan=local_plan(source)
        self.assertEqual(plan['scenes'][0]['graphics'][0]['factIds'],['home.gf'])
        validate(plan,source)

    def test_editorial_motion_without_facts_and_legacy_statistics(self):
        source={**SOURCE,'planVersion':4,'facts':[], 'motionPrompts':[{'n':2,'kind':'goals','factIds':[]}]}
        plan={'version':4,'scenes':[{'start':0,'end':5,'layers':[],'graphics':[{'kind':'goals','motionPromptNumber':2,'presentation':'editorial','factIds':[],'wordStart':0,'wordEnd':2,'at':.5,'duration':4}]}]}
        validate(copy.deepcopy(plan),source)
        bad=copy.deepcopy(plan);bad['scenes'][0]['graphics'][0]['presentation']='other'
        with self.assertRaises(ValueError):validate(bad,source)
        bad=copy.deepcopy(plan);bad['scenes'][0]['graphics'][0]['factIds']=['home.gf']
        with self.assertRaises(ValueError):validate(bad,{**source,'facts':[{'id':'home.gf','label':'Goles','value':2,'unit':'goles','source':'fixtures'}],'motionPrompts':[{'n':2,'kind':'goals','factIds':['home.gf']}]})

    def test_local_fallback_balances_and_becomes_creative_without_statistics(self):
        source={**SOURCE,'planVersion':4,'span':12,'words':[{'word':'Goles','start':.5,'end':1},{'word':'goles','start':4.5,'end':5},{'word':'goles','start':8.5,'end':9}],
                'facts':[{'id':'home.gf','label':'Goles','value':2,'unit':'goles','source':'fixtures'}],
                'motionPrompts':[{'n':2,'kind':'goals','factIds':['home.gf']}]}
        plan=local_plan(source)
        modes={g.get('presentation') for s in plan['scenes'] for g in s['graphics'] if g['kind']=='goals'}
        self.assertEqual(modes,{'editorial','statistical'})
        plan=local_plan({**source,'facts':[],'motionPrompts':[{'n':2,'kind':'goals','factIds':[]}]})
        self.assertTrue(all(g['presentation']=='editorial' for s in plan['scenes'] for g in s['graphics'] if g['kind']=='goals'))
