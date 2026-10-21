import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'fly/gateway/workspace/skills/goatlab/scripts'))
from telegram_input import ingest

REQUEST = 'a' * 32

class FeedbackTests(unittest.TestCase):
    def update(self, data, query_id='cb-1'):
        return {'update_id': 1, 'callback_query': {'id': query_id, 'data': data, 'from': {'id': 1}, 'message': {'message_id': 4, 'chat': {'id': 1, 'type': 'private'}}}}

    def test_rating_is_stored_once_and_a_reply_keeps_the_reason(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'TELEGRAM_ALLOWED_USERS': '1'}), patch('common.telegram') as telegram:
            telegram.side_effect = lambda method, body: {'message_id': 9}
            self.assertEqual(ingest(self.update(f'fb:up:{REQUEST}'), folder)['ok'], True)
            self.assertEqual(ingest(self.update(f'fb:down:{REQUEST}', 'cb-2'), folder)['ok'], True)
            self.assertEqual(ingest(self.update(f'fb:down:{REQUEST}', 'cb-2'), folder)['ok'], True)
            memory = json.loads((Path(folder) / 'director-memory' / '1.json').read_text())
            self.assertEqual(memory['items'][0]['rating'], -1)
            self.assertEqual(memory['items'].__len__(), 1)
            self.assertEqual(memory['prompts']['9'], REQUEST)
            prompts = [call.args[0] for call in telegram.call_args_list]
            self.assertEqual(prompts.count('sendMessage'), 1)
            self.assertEqual(ingest({'update_id': 2, 'message': {'text': 'el titulo se corta', 'from': {'id': 1}, 'chat': {'id': 1, 'type': 'private'}, 'reply_to_message': {'message_id': 9}}}, folder)['ok'], True)
            memory = json.loads((Path(folder) / 'director-memory' / '1.json').read_text())
            self.assertEqual(memory['items'][0]['reason'], 'el titulo se corta')
            self.assertIsNone(ingest({'update_id': 3, 'message': {'text': 'hola', 'from': {'id': 1}, 'chat': {'id': 1, 'type': 'private'}}}, folder))
            stranger = self.update(f'fb:up:{REQUEST}', 'cb-3')
            stranger['callback_query']['from'] = {'id': 9}
            self.assertEqual(ingest(stranger, folder)['ignored'], True)
