import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'fly/gateway/workspace/skills/goatlab/scripts'))
from workflow import Workflow
from progress import ProgressReporter, progress_text

class ProgressTests(unittest.TestCase):
    def test_current_bank_targets_and_no_timer_or_generation_copy(self):
        for clips in (0, 2):
            text = progress_text(4, 'finished', [], 1000, 4000, target=4, clips=clips)
            self.assertIn('Imágenes disponibles: 4/4', text)
            self.assertIn(f'Clips disponibles: {clips}/2', text)
            for obsolete in ('Tiempo transcurrido', 'Generando', '40%', 'interrumpida'):
                self.assertNotIn(obsolete, text)
            self.assertIn('Banco disponible' if clips == 2 else 'Banco parcial', text)

    def test_stale_and_queued_jobs_never_claim_active_planning(self):
        job = {'status': 'working', 'variant': 3, 'currentStage': 'planning', 'updatedAt': 1000000}
        self.assertIn('Video 4: planificando', progress_text(4, 'finished', [job], 1000, 1080, clips=2))
        self.assertIn('Estado pendiente de actualización', progress_text(4, 'finished', [job], 1000, 1091, clips=2))
        self.assertNotIn('planificando', progress_text(4, 'finished', [{**job, 'status': 'queued'}], 1000, 1080, clips=2))

    def test_confirmed_error_wins_over_a_pending_video(self):
        text = progress_text(4, 'finished', [{'status': 'queued', 'variant': 5}, {'status': 'error', 'variant': 3, 'error': 'montaje inválido'}], 0, 10, clips=0)
        self.assertIn('Video 4: detenido', text)
        self.assertIn('montaje inválido', text)

    def test_one_message_is_edited_with_real_counts_and_cleanup_after_reset(self):
        with tempfile.TemporaryDirectory() as root:
            now=[1000];flow=Workflow(Path(root)/'goatlab.sqlite',clock=lambda:now[0])
            flow.select('1',{'matchId':'a-b','scripts':[{} for _ in range(10)]})
            request=flow.receive('1','voice','288')['requestId']
            calls=[]
            def send(method,body):calls.append((method,body));return {'message_id':12}
            reporter=ProgressReporter(flow,send=send,clock=lambda:now[0])
            media=Path(root)/'media-pack';media.mkdir()
            (media/'a-b.progress.json').write_text(json.dumps({'count':4,'clips':0,'phase':'consulting'}))
            reporter.update([]);reporter.update([])
            self.assertEqual(len(calls),1);self.assertIn('4/4',calls[0][1]['text'])
            self.assertIn('Audios recibidos: 1',calls[0][1]['text']);self.assertNotIn('Esperando audios',calls[0][1]['text'])
            now[0]+=10
            reporter.update([{'requestId':request,'status':'working','variant':0,'currentStage':'planning','updatedAt':now[0]*1000}])
            self.assertEqual(calls[-1][0],'editMessageText');self.assertEqual(calls[-1][1]['message_id'],12)
            self.assertIn('planificando',calls[-1][1]['text'])
            flow.reset('1');now[0]+=10;reporter.update([])
            self.assertEqual(flow.db.execute('SELECT COUNT(*) FROM progress').fetchone()[0],0)
            self.assertEqual(len(calls),2);flow.db.close()

    def test_media_failure_is_persisted_in_editable_progress_and_survives_restart(self):
        with tempfile.TemporaryDirectory() as root:
            now=[1000];flow=Workflow(Path(root)/'goatlab.sqlite',clock=lambda:now[0])
            flow.select('1',{'matchId':'a-b','scripts':[{} for _ in range(10)]})
            for i in range(3):flow.receive('1','voice',str(i))
            flow.db.execute("UPDATE tasks SET status='failed' WHERE kind='media'")
            calls=[]
            reporter=ProgressReporter(flow,send=lambda method,body:(calls.append(body) or {'message_id':12}),clock=lambda:now[0])
            reporter.update([])
            self.assertIn('consultar el banco en R2',calls[-1]['text']);self.assertIn('Audios recibidos: 3',calls[-1]['text'])
            now[0]+=40
            restored=ProgressReporter(flow,send=lambda method,body:(calls.append(body) or {'message_id':12}),clock=lambda:now[0])
            restored.update([])
            self.assertEqual(len(calls), 1)  # No timer: unchanged state needs no edit.
            self.assertEqual(flow.db.execute('SELECT message_id FROM progress').fetchone()[0], 12)
            flow.db.close()

    def test_retry_supersedes_the_previous_worker_error_while_preparing_media(self):
        with tempfile.TemporaryDirectory() as root:
            flow=Workflow(Path(root)/'goatlab.sqlite',clock=lambda:1000)
            flow.select('1',{'matchId':'a-b','scripts':[{} for _ in range(10)]})
            request=flow.receive('1','voice','event')['requestId'];calls=[]
            reporter=ProgressReporter(flow,send=lambda method,body:(calls.append(body) or {'message_id':12}),clock=lambda:1000)
            reporter.update([{'requestId':request,'status':'error','variant':0}])
            self.assertNotIn('detenido',calls[-1]['text']);self.assertIn('1 videos pendientes',calls[-1]['text'])
            flow.db.close()
