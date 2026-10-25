import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'fly/gateway/workspace/skills/goatlab/scripts'))
from datetime import datetime, timezone
from content_client import ContentClient, list_text, match_summary, order_matches

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
        return {'version':1,'category':category,'matchId':'a-b','home':'A','away':'B','facts':[],'prompts':rows}

    def test_prompt_contract_is_four_photos_two_clips(self):
        from content_client import valid
        image=self.pack('image-prompts',['ball-duel','goal-action','supporters','stadium'])
        video=self.pack('video-prompts',['push-in','tracking'])
        for category,data in [('image-prompts',image),('video-prompts',video)]:
            self.assertTrue(valid(data,category,'a-b'), category)
        # El contrato antiguo (10 fotos / 5 clips) se rechaza: mismo fallo que rompió Croacia.
        old_image=self.pack('image-prompts',['ball-duel','pressing','passing','dribbling','crossing','defending','aerial-duel','goal-action','supporters','stadium'])
        self.assertFalse(valid(old_image,'image-prompts','a-b'))
        old_video=self.pack('video-prompts',['push-in','tracking','orbit','pull-out','focus-transition'])
        self.assertFalse(valid(old_video,'video-prompts','a-b'))
    def test_retired_category_is_not_requested(self):
        from content_client import KINDS, valid
        self.assertNotIn('motion-prompts', KINDS)
        self.assertFalse(valid({}, 'motion-prompts', 'a-b'))

    def test_telegram_list_uses_lima_day_and_drops_started_matches(self):
        now = datetime(2026, 10, 15, 16, 53, tzinfo=timezone.utc).timestamp()
        matches = [
            {'matchId': 'flu', 'home': 'Fluminense', 'away': 'Palmeiras', 'competition': 'libertadores', 'kickoff': '2026-10-15T00:30:00+00:00'},
            {'matchId': 'later', 'home': 'Alpha', 'away': 'Beta', 'competition': 'premier', 'kickoff': '2026-10-16T15:00:00Z'},
            {'matchId': 'est', 'home': 'Estudiantes de La Plata', 'away': 'Flamengo', 'competition': 'libertadores', 'kickoff': '2026-10-16T00:30:00+00:00'},
            {'matchId': 'afternoon', 'home': 'Gamma', 'away': 'Delta', 'competition': 'laliga', 'kickoff': '2026-10-15T20:00:00Z'},
        ]
        ordered = order_matches(matches, now)
        self.assertEqual([match['matchId'] for match in ordered], ['afternoon', 'est', 'later'])
        text = list_text(ordered, {'libertadores': 'Libertadores', 'premier': 'Premier League', 'laliga': 'LaLiga'})
        self.assertEqual(text, '\n'.join([
            'Jueves 15 de octubre',
            '1. Gamma vs Delta · LaLiga · 15:00',
            '2. Estudiantes de La Plata vs Flamengo · Libertadores · 19:30',
            '',
            'Viernes 16 de octubre',
            '3. Alpha vs Beta · Premier League · 10:00',
        ]))
        self.assertNotIn('Fluminense', text)
        self.assertNotIn('16 de octubre\n2.', text)
        summary = match_summary(ordered[1], 2, {'libertadores': 'Libertadores'})
        self.assertEqual(summary['day'], 'Jueves 15 de octubre')
        self.assertEqual(summary['time'], '19:30')
        self.assertNotIn('kickoff', summary)
