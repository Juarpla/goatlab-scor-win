import concurrent.futures
import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'fly/gateway/workspace/skills/goatlab/scripts'))
from workflow import Workflow


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
            env = {**os.environ,'GOATLAB_REPO':str(root/'data'),'GOATLAB_STATE_DIR':str(root/'state')}
            def call(*args):
                return json.loads(subprocess.check_output([sys.executable,str(root/'skill/scripts/goatlab.py'),*args],env=env,cwd=root))
            call('reset','--chat=1')
            self.assertEqual(call('list','--chat=1')[0]['matchId'],'a-b')
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
        with patch('workflow.request_json',side_effect=[{'ok':True,'workflowProtocol':2},{'jobId':'stable'}]) as call:
            self.assertEqual(worker_post('/render',{'requestId':'stable'}),{'jobId':'stable'})
            self.assertEqual(call.call_count,2)

class IdleCleanupTests(unittest.TestCase):
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
            self.assertFalse((media/'a-b.json').exists())
            self.assertEqual(flow.db.execute('SELECT file_id FROM audios WHERE id=?',(request,)).fetchone()[0],'')
