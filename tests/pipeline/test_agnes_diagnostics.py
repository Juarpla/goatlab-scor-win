import contextlib
import io
import json
import os
import unittest
from unittest.mock import patch
from agnes_diagnostics import provider_diagnostic


class DiagnosticTests(unittest.TestCase):
    def test_provider_observation_strips_payloads_and_keeps_status(self):
        class State:
            def diagnostic(self, attempt, record):
                self.record = record
        state = State()
        payload = {'status': 'completed', 'progress': 100, 'video_id': 'private-id',
                   'data': [{'b64_json': 'binary-data'}], 'prompt': 'private-prompt',
                   'message': 'secret-key https://example.org/clip?signature=private-signature'}
        logs = io.StringIO()
        with patch.dict(os.environ, {'AGNES_API_KEY': 'secret-key', 'AGNES_RUN_ID': 'run-1'}), contextlib.redirect_stderr(logs):
            provider_diagnostic(state, 'video', 'a-b', 0, {'attemptId': 'attempt-1', 'stage': 'retrieve-response', 'httpStatus': 200, 'body': payload})
        for secret in ['binary-data', 'private-prompt', 'private-id', 'secret-key', 'private-signature']:
            self.assertNotIn(secret, logs.getvalue() + json.dumps(state.record))
        self.assertEqual(state.record['progress'], 100)
        self.assertEqual(state.record['providerStatus'], 'completed')
        self.assertEqual(state.record['method'], 'GET')

    def test_failed_persistence_is_visible_and_does_not_raise(self):
        class State:
            def diagnostic(self, attempt, record):
                raise ValueError('R2 unavailable')
        logs = io.StringIO()
        with contextlib.redirect_stderr(logs):
            provider_diagnostic(State(), 'image', 'a-b', 0, {'attemptId': 'attempt-1', 'stage': 'create', 'httpStatus': 503,
                'body': {'code': 'video_queue_full', 'message': 'x' * 500}})
        self.assertIn('no se pudo guardar diagnóstico', logs.getvalue())
        self.assertIn('no repetir POST', logs.getvalue())
        self.assertIn('503', logs.getvalue())
