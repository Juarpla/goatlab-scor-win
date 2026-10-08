"""Mandatory remote admission. Local SQLite is a disposable recovery cache."""
import hashlib
import json
import os
import subprocess
import time
import uuid
from datetime import datetime
from pathlib import Path

SCRIPT = Path(__file__).with_name('agnes-state.mjs')


class AgnesState:
    def __init__(self, env=None, run=subprocess.run, clock=time.time):
        self.env = dict(os.environ if env is None else env)
        self.run, self.clock = run, clock
        self.owner = self.env.get('AGNES_RUN_ID') or str(uuid.uuid4())
        self._fixtures = None
        self._observed = 0

    def call(self, operation, value=None):
        try:
            result = self.run([self.env.get('NODE_BIN', 'node'), str(SCRIPT), operation],
                              input=json.dumps(value or {}), text=True, capture_output=True,
                              env=self.env, timeout=35, check=False)
            payload = json.loads(result.stdout)
            counter_file = self.env.get('AGNES_OPERATIONS_FILE')
            if counter_file and isinstance(payload, dict) and isinstance(payload.get('operations'), dict):
                with Path(counter_file).open('a') as counter:
                    counter.write(json.dumps(payload['operations']) + '\n')
        except (OSError, ValueError, subprocess.SubprocessError):
            raise ValueError('autoridad Agnes no disponible; generación cerrada') from None
        if result.returncode or not isinstance(payload, dict) or payload.get('ok') is not True:
            reason = payload.get('reason', 'no disponible') if isinstance(payload, dict) else 'respuesta inválida'
            raise ValueError('autoridad Agnes: ' + str(reason)[:180])
        return payload

    def guard(self, match, expires):
        try:
            identity = json.loads(Path(self.env['AGNES_GUARD_FILE']).read_text())
            kickoff = datetime.fromisoformat(identity['kickoff'].replace('Z', '+00:00')).timestamp()
            if datetime.fromisoformat(identity['kickoff'].replace('Z', '+00:00')).tzinfo is None:
                raise ValueError()
            if (identity.get('webId') or identity.get('id') or identity.get('matchId')) != match:
                raise ValueError()
            if self.env.get('AGNES_MANUAL') == '1':
                return {'manual': True, 'kickoffMs': kickoff * 1000}
            now = self.clock()
            if self._fixtures is None or now - self._observed >= 60:
                repo = self.env.get('GOATLAB_REPO', '.')
                fetched = self.run(['git', 'fetch', '--quiet', 'origin', 'main'], cwd=repo,
                                   text=True, capture_output=True, timeout=20, check=False)
                if fetched.returncode:
                    raise ValueError()
                shown = self.run(['git', 'show', 'origin/main:public/data/fixtures.json'], cwd=repo,
                                 text=True, capture_output=True, timeout=10, check=False)
                if shown.returncode:
                    raise ValueError()
                self._fixtures = json.loads(shown.stdout).get('matches', [])
                self._observed = self.clock()
            current = next((m for m in self._fixtures if (m.get('webId') or m.get('id')) == match), None)
            if not current or current.get('status') != 'NS' or kickoff <= self.clock():
                raise ValueError()
            for key in ('home', 'away', 'competition', 'kickoff'):
                if current.get(key) != identity.get(key):
                    raise ValueError()
            context = json.dumps({key: current.get(key) for key in ('id', 'webId', 'home', 'away', 'competition', 'kickoff', 'status')}, sort_keys=True)
            return {'manual': False, 'kickoffMs': kickoff * 1000, 'observedAtMs': self._observed * 1000,
                    'contextHash': hashlib.sha256(context.encode()).hexdigest()}
        except (KeyError, OSError, ValueError, StopIteration, subprocess.SubprocessError):
            self._fixtures = None
            raise ValueError('fixture vigente no verificado; no se envía POST') from None

    def reserve(self, match, kind, ordinal, prompt, model, expires, reference=None):
        value = {'attemptId': str(uuid.uuid4()), 'matchId': match, 'kind': kind, 'ordinal': ordinal,
                 'promptHash': hashlib.sha256(prompt.encode()).hexdigest(), 'model': model,
                 'expiresAtMs': expires * 1000, 'guard': self.guard(match, expires)}
        if reference is not None:
            value['referenceHash'] = hashlib.sha256(reference.encode()).hexdigest()
        return self.call('reserve', value)

    def status(self, match, kind, ordinal):
        return self.call('status', {'matchId': match, 'kind': kind, 'ordinal': ordinal}).get('slot')

    def event(self, attempt_id, event_type, **extra):
        value = {'attemptId': attempt_id, 'eventId': str(uuid.uuid4()), 'type': event_type, **extra}
        # Events may safely be retried with the same id. Reserve permissions may not.
        for attempt in range(3):
            try:
                return self.call('event', value)
            except ValueError:
                if attempt == 2:
                    raise

    def pollclaim(self, match, ordinal):
        return self.call('pollclaim', {'matchId': match, 'kind': 'video', 'ordinal': ordinal, 'owner': self.owner})
