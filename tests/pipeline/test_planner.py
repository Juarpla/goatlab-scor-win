import copy
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'fly/gateway/workspace/skills/goatlab/scripts'))
from planner import create_plan, validate


SOURCE = {'span': 5, 'words': [{'word': 'Ganó', 'start': .5, 'end': 1}, {'word': 'tres', 'start': 1, 'end': 1.4}],
          'assets': [{'index': 0}, {'index': 1}], 'variant': 0}
PLAN = {'version': 1, 'scenes': [{'start': 0, 'end': 5, 'layers': [{'asset': 0}],
        'graphics': [{'kind': 'stat', 'at': .5, 'duration': 2, 'wordStart': 0, 'wordEnd': 2}]}]}


class PlannerTests(unittest.TestCase):
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
