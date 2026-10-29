import concurrent.futures
import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'fly/gateway/workspace/skills/goatlab/scripts'))
from workflow import Workflow, runnable_renders


def script():
    return {'matchId': 'a-b', 'home': 'A', 'away': 'B', 'scripts': [
        {'title': f'Video {i}', 'hook': 'Ojo', 'narration': 'Texto original'} for i in range(10)]}


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'state.sqlite'
        self.flow = Workflow(self.path)
        self.addCleanup(self.flow.db.close)
        self.flow.select('1', script())

    def test_ten_notes_survive_restart_and_duplicates(self):
        for i in range(10):
            result = self.flow.receive('1', f'file-{i}', str(i))
            self.assertEqual(result['n'], i + 1)
            self.assertEqual(self.flow.receive('1', f'file-{i}', str(i))['requestId'], result['requestId'])
        restored = Workflow(self.path)
        self.addCleanup(restored.db.close)
        self.assertEqual(restored.current('1')['closed'], 1)
        self.assertEqual(restored.db.execute("SELECT COUNT(*) FROM tasks WHERE kind='render'").fetchone()[0], 10)
        with self.assertRaises(ValueError):
            restored.receive('1', 'extra', '11')

    def test_replace_last_reopens_and_cancels_old_request(self):
        for i in range(10):
            old = self.flow.receive('1', f'file-{i}', str(i))
        self.assertEqual(self.flow.drop_last('1')['reuses'], 10)
        new = self.flow.receive('1', 'replacement', 'replacement-event')
        self.assertEqual(new['n'], 10)
        self.assertNotEqual(new['requestId'], old['requestId'])
        self.assertEqual(self.flow.db.execute('SELECT status FROM tasks WHERE id=?', (old['requestId'],)).fetchone()[0], 'cancelled')
        self.assertIsNotNone(self.flow.db.execute('SELECT id FROM tasks WHERE id=?', ('cancel:' + old['requestId'],)).fetchone())

    def test_reset_and_other_chats_are_isolated(self):
        self.flow.select('2', script())
        self.flow.receive('1', 'a', '1')
        self.flow.receive('2', 'b', '1')
        self.flow.reset('1')
        self.assertIsNone(self.flow.current('1'))
        self.assertEqual(self.flow.receive('2', 'c', '2')['n'], 2)
        self.flow.select('1', script())
        self.assertEqual(self.flow.receive('1', 'a', '1')['n'], 1)
        self.assertEqual(self.flow.db.execute("SELECT COUNT(*) FROM tasks WHERE kind='media'").fetchone()[0], 1)

    def test_concurrent_duplicate_has_one_slot_and_one_task(self):
        def receive(_):
            flow = Workflow(self.path)
            try:
                return flow.receive('1', 'same-file', 'same-event')
            finally:
                flow.db.close()
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(receive, range(8)))
        self.assertEqual(len({r['requestId'] for r in results}), 1)
        self.assertEqual(self.flow.db.execute('SELECT COUNT(*) FROM audios').fetchone()[0], 1)

    def test_pending_payload_has_stable_identity_and_no_narration(self):
        result = self.flow.receive('1', 'voice', 'event')
        task = self.flow.db.execute('SELECT * FROM tasks WHERE id=?', (result['requestId'],)).fetchone()
        payload = json.loads(task['payload'])
        self.assertEqual(task['status'], 'queued')
        self.assertEqual(payload['requestId'], result['requestId'])
        self.assertNotIn('narration', payload)

class RecoveryVisibilityTests(unittest.TestCase):
    def test_media_refresh_updates_unsubmitted_tasks_across_chats_without_touching_accepted_jobs(self):
        with tempfile.TemporaryDirectory() as folder:
            flow = Workflow(Path(folder)/'goatlab.sqlite')
            self.addCleanup(flow.db.close)
            flow.select('1', script()); flow.select('2', script())
            ids = [flow.receive(chat, 'voice', 'event')['requestId'] for chat in ('1','2')]
            for request in ids:
                row = flow.db.execute('SELECT payload FROM tasks WHERE id=?', (request,)).fetchone()
                body = {**json.loads(row[0]), 'assets': [{'id': 'old'}], 'clips': [], 'facts': [{'id': 'fact'}]}
                flow.db.execute('UPDATE tasks SET payload=? WHERE id=?', (json.dumps(body), request))
            flow.refresh_pending_media('a-b', [{'requestId': ids[0], 'status': 'done'}])
            accepted = json.loads(flow.db.execute('SELECT payload FROM tasks WHERE id=?', (ids[0],)).fetchone()[0])
            pending = json.loads(flow.db.execute('SELECT payload FROM tasks WHERE id=?', (ids[1],)).fetchone()[0])
            self.assertIn('assets', accepted); self.assertNotIn('assets', pending)
            self.assertEqual(pending['contentFacts'], [{'id': 'fact'}])
            self.assertEqual(pending['requestId'], ids[1]); self.assertEqual(pending['audioFileId'], 'voice')

    def test_legacy_media_recovery_preserves_audios_and_accepted_jobs_and_runs_once(self):
        with tempfile.TemporaryDirectory() as folder:
            flow = Workflow(Path(folder)/'goatlab.sqlite', clock=lambda: 1000)
            self.addCleanup(flow.db.close)
            flow.select('1', script()); flow.select('2', script())
            request = flow.receive('1', 'voice', 'event')['requestId']
            flow.db.execute("UPDATE tasks SET status='done',result=? WHERE id=?", (json.dumps({'jobId': 'accepted'}), request))
            flow.db.execute("UPDATE tasks SET payload=?,status='failed' WHERE kind='media'", (json.dumps({'matchId': 'a-b'}),))
            before = dict(flow.db.execute('SELECT * FROM tasks WHERE id=?', (request,)).fetchone())
            flow.recover_media()
            media = flow.db.execute("SELECT * FROM tasks WHERE kind='media'").fetchone()
            self.assertEqual(media['status'], 'queued')
            self.assertEqual(json.loads(media['payload'])['readerVersion'], 1)
            self.assertEqual(dict(flow.db.execute('SELECT * FROM tasks WHERE id=?', (request,)).fetchone()), before)
            self.assertEqual(flow.db.execute('SELECT file_id FROM audios WHERE id=?', (request,)).fetchone()[0], 'voice')
            flow.db.execute("UPDATE tasks SET status='done' WHERE kind='media'")
            flow.recover_media()
            self.assertEqual(flow.db.execute("SELECT status FROM tasks WHERE kind='media'").fetchone()[0], 'done')

    def test_media_executor_uses_only_reader_and_cleanup_never_calls_remote_maintenance(self):
        import os
        from unittest.mock import patch
        from workflow import execute
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'MEDIA_PACK_DIR': folder}):
            with patch('workflow.subprocess.run') as run:
                self.assertTrue(execute({'kind': 'media', 'payload': json.dumps({'matchId': 'a-b'})})['ready'])
                self.assertTrue(run.call_args.args[0][1].endswith('/read-media-bank.mjs'))
                self.assertEqual(run.call_args.kwargs['env']['MEDIA_ROLE'], 'consumer')
            flow = Workflow(Path(folder)/'goatlab.sqlite')
            self.addCleanup(flow.db.close)
            with patch('workflow.subprocess.run') as run:
                flow.release_media()
                run.assert_not_called()

    def test_status_distinguishes_submission_from_uncertain_delivery(self):
        from unittest.mock import patch
        from workflow import render_status
        audio = {'ordinal': 3, 'status': 'done', 'cancelled': 0, 'result': json.dumps({'jobId': 'job-stable', 'status': 'queued'})}
        with patch('workflow.request_json', return_value={'id': 'job-stable', 'status': 'delivery-unknown', 'audioUrl': 'private', 'error': 'Verificar Telegram'}) as call:
            result = render_status(audio)
        self.assertEqual(result['status'], 'done')
        self.assertEqual(result['render']['status'], 'delivery-unknown')
        self.assertNotIn('audioUrl', result['render'])
        self.assertTrue(call.call_args.args[0].endswith('/jobs/job-stable'))

    def test_failed_search_never_releases_a_render(self):
        import os
        import subprocess
        from unittest.mock import patch
        from workflow import execute
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'MEDIA_PACK_DIR': folder}), patch('workflow.subprocess.run', side_effect=subprocess.CalledProcessError(1, 'media')):
            with self.assertRaises(subprocess.CalledProcessError):
                execute({'kind': 'media', 'payload': json.dumps({'matchId': 'a-b'})})
            self.assertFalse((Path(folder) / 'a-b.ready').exists())
            with patch('workflow.worker_post') as post:
                self.assertIsNone(execute({'kind': 'render', 'payload': json.dumps({'matchId': 'a-b'})}))
                post.assert_not_called()

    def test_status_keeps_director_diagnostics_when_the_last_turn_failed(self):
        import hashlib
        from unittest.mock import patch
        from workflow import render_status
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            directory = root / 'director' / hashlib.sha256(b'failed-audio').hexdigest()
            directory.mkdir(parents=True)
            (directory / 'state.json').write_text(json.dumps({'generation': 1, 'error': 'plan failed', 'history': [
                {'generation': 1, 'stage': 'plan-v5-0-0', 'ms': 120, 'error': 'provider unavailable'}]}))
            audio = {'requestId': 'failed-audio', 'result': json.dumps({'jobId': 'job-failed'})}
            with patch('workflow.STATE', root), patch('workflow.request_json', return_value={'status': 'error'}):
                result = render_status(audio)
            self.assertEqual(result['director']['error'], 'plan failed')
            self.assertEqual(result['director']['turns'][0]['error'], 'provider unavailable')
            self.assertEqual(result['director']['turns'][0]['ms'], 120)

class TemporaryStateTests(unittest.TestCase):
    def test_expired_series_and_repeated_resets_do_not_accumulate_history(self):
        import os
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'GOATLAB_STATE_DIR': folder}):
            import workflow
            with patch.object(workflow, 'STATE', Path(folder)):
                now = [1000.0]
                flow = Workflow(Path(folder)/'goatlab.sqlite', clock=lambda: now[0])
                self.addCleanup(flow.db.close)
                for i in range(50):
                    flow.select('1', script())
                    flow.receive('1', 'voice', str(i))
                    flow.reset('1')
                    now[0] += 86401
                    flow.cleanup()
                for table in ('series', 'audios', 'choices'):
                    self.assertEqual(flow.db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0], 0)
                self.assertLess((Path(folder)/'goatlab.sqlite').stat().st_size, 4_500_000)
                self.assertEqual(flow.db.execute('PRAGMA journal_mode').fetchone()[0], 'delete')
                self.assertLessEqual(flow.db.execute('PRAGMA max_page_count').fetchone()[0]*flow.db.execute('PRAGMA page_size').fetchone()[0],4_500_000)

    def test_expired_audio_is_rejected_and_listing_alone_creates_no_tasks(self):
        with tempfile.TemporaryDirectory() as folder:
            now = [1000.0]
            flow = Workflow(Path(folder)/'goatlab.sqlite', clock=lambda: now[0])
            self.addCleanup(flow.db.close)
            self.assertEqual(flow.db.execute('SELECT COUNT(*) FROM tasks').fetchone()[0], 0)
            flow.select('1', script())
            now[0] += 86401
            with self.assertRaises(ValueError):
                flow.receive('1','voice','event')

class PortableSkillTests(unittest.TestCase):
    def test_copied_skill_lists_selects_and_receives_without_original_repo(self):
        import os
        import shutil
        import subprocess
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = Path(__file__).resolve().parents[2]/'fly/gateway/workspace/skills/goatlab'
            shutil.copytree(source,root/'skill',ignore=shutil.ignore_patterns('__pycache__'))
            data = root/'data/public/data/youtube-scripts'
            data.mkdir(parents=True)
            (data/'a-b.json').write_text(json.dumps(script()))
            env = {**os.environ,'GOATLAB_REPO':str(root/'data'),'GOATLAB_STATE_DIR':str(root/'state'),'GOATLAB_CONTENT_BASE_URL':''}
            def call(*args):
                return json.loads(subprocess.check_output([sys.executable,str(root/'skill/scripts/goatlab.py'),*args],env=env,cwd=root))
            call('reset','--chat=1')
            listed = call('list','--chat=1')
            self.assertEqual(listed['matches'][0]['matchId'],'a-b')
            self.assertIn('1. A vs B', listed['text'])
            flow = Workflow(root/'state/goatlab.sqlite')
            self.addCleanup(flow.db.close)
            self.assertEqual(flow.db.execute('SELECT COUNT(*) FROM tasks').fetchone()[0],0)
            call('select','--chat=1','--number=1')
            self.assertEqual(call('receive','--chat=1','--audio=telegram_valid_voice_id','--event=1')['n'],1)
            call('reset','--chat=1')
            self.assertIsNone(call('status','--chat=1'))
            subprocess.check_call(['node','--input-type=module','-e',"await import('./skill/lib/youtube.js'); await import('./skill/lib/agnes.js');"],cwd=root)

class DeploymentCompatibilityTests(unittest.TestCase):
    def test_gateway_waits_for_render_contract_before_submitting(self):
        from unittest.mock import patch
        from workflow import worker_post
        with patch('workflow.request_json', return_value={'ok':True}) as call:
            self.assertIsNone(worker_post('/render',{'requestId':'stable'}))
            self.assertEqual(call.call_count,1)
        with patch('workflow.request_json',side_effect=[{'ok':True,'workflowProtocol':3},{'jobId':'stable'}]) as call:
            self.assertEqual(worker_post('/render',{'requestId':'stable'}),{'jobId':'stable'})
            self.assertEqual(call.call_count,2)

class IdleCleanupTests(unittest.TestCase):
    def test_shared_bank_survives_expiry_without_confirmed_final_and_remote_deletion(self):
        import os
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            flow = Workflow(root/'goatlab.sqlite', clock=lambda: 1800000000)
            self.addCleanup(flow.db.close)
            media = root/'media-pack'; media.mkdir()
            bank = media/'a-b.json'
            bank.write_text(json.dumps({'contentVersion': 1, 'kickoff': '2027-01-15T08:00:00Z'}))
            assets = media/'gen/a-b'; assets.mkdir(parents=True)
            (assets/'image.jpg').write_bytes(b'cached')
            with patch.dict(os.environ, {'MEDIA_PACK_DIR': str(media)}):
                flow.release_media()
                self.assertTrue(bank.exists())
                self.assertTrue(assets.exists())
                bank.write_text(json.dumps({'contentVersion': 1, 'kickoff': '2020-01-01T00:00:00Z'}))
                flow.release_media()
                self.assertTrue(bank.exists())
                self.assertTrue(assets.exists())

    def test_cleanup_reads_local_delivery_record_without_waking_render(self):
        import os
        import time
        from unittest.mock import patch
        from render_ledger import Ledger
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            flow=Workflow(root/'goatlab.sqlite')
            self.addCleanup(flow.db.close)
            flow.select('1',script())
            request=flow.receive('1','voice','event')['requestId']
            job_id='job-'+'f'*32
            flow.db.execute('UPDATE series SET closed=1')
            flow.db.execute("UPDATE tasks SET status='done'")
            flow.db.execute('UPDATE tasks SET result=? WHERE id=?',(json.dumps({'jobId':job_id}),request))
            Ledger(root/'render-ledger').put({'id':job_id,'status':'done','expiresAt':int((time.time()+3600)*1000)})
            media=root/'media-pack'; media.mkdir(); (media/'a-b.json').write_text('{}')
            with patch.dict(os.environ,{'MEDIA_PACK_DIR':str(media)}), patch('workflow.request_json') as http:
                flow.release_media()
                http.assert_not_called()
            self.assertTrue((media/'a-b.json').exists())
            self.assertEqual(flow.db.execute('SELECT file_id FROM audios WHERE id=?',(request,)).fetchone()[0],'')


class DirectorSlots(unittest.TestCase):
    def row(self, ident, chat):
        return {'id': ident, 'kind': 'render', 'payload': json.dumps({'chatId': chat})}

    def test_two_same_chat_audios_start_and_the_third_waits(self):
        rows = [self.row(name, '1') for name in ('a', 'b', 'c')]
        pending = {'1': ['a', 'b', 'c']}
        self.assertEqual(runnable_renders(rows, [], [], pending, 2), ['a', 'b'])

    def test_a_failed_audio_occupies_the_first_slot(self):
        rows = [self.row('q1', '1')]
        pending = {'1': ['failed', 'q1']}
        self.assertEqual(runnable_renders(rows, [], [], pending, 1), [])
        self.assertEqual(runnable_renders(rows, [], [], pending, 2), ['q1'])

    def test_one_chat_cannot_take_the_global_slots_of_another(self):
        running = [{'id': 'a1', 'kind': 'render'}, {'id': 'a2', 'kind': 'render'}]
        self.assertEqual(runnable_renders([self.row('b1', '2')], running, [], {'2': ['b1']}, 2), [])

    def test_received_audio_keeps_the_telegram_message_id(self):
        with tempfile.TemporaryDirectory() as folder:
            flow = Workflow(Path(folder) / 'goatlab.sqlite')
            self.addCleanup(flow.db.close)
            flow.select('1', script())
            flow.receive('1', 'AwACAgEAA_real_voice_id', '288')
            body = json.loads(flow.db.execute("SELECT payload FROM tasks WHERE kind='render'").fetchone()[0])
            self.assertEqual(body['audioMessageId'], 288)
