import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'fly/gateway/workspace/skills/goatlab/scripts'))
from workflow import Workflow
from progress import ProgressReporter

class ProgressTests(unittest.TestCase):
    def test_one_message_is_edited_with_real_counts_and_cleanup_after_reset(self):
        with tempfile.TemporaryDirectory() as root:
            now=[1000];flow=Workflow(Path(root)/'goatlab.sqlite',clock=lambda:now[0])
            flow.select('1',{'matchId':'a-b','scripts':[{} for _ in range(10)]})
            request=flow.receive('1','voice','288')['requestId']
            calls=[]
            def send(method,body):calls.append((method,body));return {'message_id':12}
            reporter=ProgressReporter(flow,send=send,clock=lambda:now[0])
            media=Path(root)/'media-pack';media.mkdir()
            (media/'a-b.progress.json').write_text(json.dumps({'count':8,'phase':'generating'}))
            reporter.update([]);reporter.update([])
            self.assertEqual(len(calls),1);self.assertIn('8/15 · 53%',calls[0][1]['text'])
            self.assertIn('Audios recibidos: 1',calls[0][1]['text']);self.assertNotIn('Esperando audios',calls[0][1]['text'])
            now[0]+=10
            reporter.update([{'requestId':request,'status':'working','variant':0,'currentStage':'planning'}])
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
            self.assertIn('interrumpida',calls[-1]['text']);self.assertIn('Audios recibidos: 3',calls[-1]['text'])
            now[0]+=40
            restored=ProgressReporter(flow,send=lambda method,body:(calls.append(body) or {'message_id':12}),clock=lambda:now[0])
            restored.update([]);self.assertEqual(calls[-1]['message_id'],12)
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
