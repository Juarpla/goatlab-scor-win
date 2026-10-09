"""Explicit test-only remote backend. No environment switch bypasses production."""
import hashlib
import uuid
from common import quota_day


class FakeAgnesState:
    def __init__(self, clock):
        self.clock = clock
        self.slots, self.attempts, self.quota = {}, {}, {}
        self.caps = {'images': 4000, 'video_seconds': 360}
        self.active = None
        self.next_video = 0

    def status(self, match, kind, ordinal):
        return self.slots.get((match, kind, ordinal))

    def seed(self, match, ordinal, video_id='old-id', prompt='Prompt 0', reference='https://example.org/image.jpg', expires=3000):
        attempt = str(uuid.uuid4())
        self.slots[(match, 'video', ordinal)] = {'state': 'pending', 'videoId': video_id, 'attemptId': attempt,
            'promptHash': hashlib.sha256(prompt.encode()).hexdigest(), 'referenceHash': hashlib.sha256(reference.encode()).hexdigest(),
            'expires': expires, 'day': quota_day(self.clock()), 'units': 0, 'refunded': False}
        self.attempts[attempt] = self.slots[(match, 'video', ordinal)]
        self.active = attempt

    def reserve(self, match, kind, ordinal, prompt, model, expires, reference=None):
        key = (match, kind, ordinal)
        row = self.slots.get(key)
        identity = hashlib.sha256(prompt.encode()).hexdigest()
        if row and row['promptHash'] != identity:
            return {'canPost': False, 'reason': 'slot pertenece a otra versión de prompts'}
        if row and row['state'] != 'rejected':
            return {'canPost': False, 'reason': 'resultado incierto; no se repite' if row['state'] == 'uncertain' else 'slot ya utilizado'}
        if kind == 'video' and self.active and self.attempts[self.active]['expires'] > self.clock():
            return {'canPost': False, 'reason': 'otra tarea pendiente o incierta'}
        if kind == 'video' and self.next_video > self.clock():
            return {'canPost': False, 'reason': 'ritmo de llamadas', 'retryAtMs': self.next_video * 1000}
        day = quota_day(self.clock())
        quota = self.quota.setdefault(day, {'images': 0, 'video_seconds': 0})
        name, units = ('images', 1) if kind == 'image' else ('video_seconds', 6)
        if quota[name] + units > self.caps[name]:
            return {'canPost': False, 'reason': 'cuota diaria de imágenes agotada' if kind == 'image' else 'cuota de vídeo diaria agotada'}
        quota[name] += units
        attempt = str(uuid.uuid4())
        row = {'state': 'uncertain', 'videoId': None, 'attemptId': attempt, 'promptHash': identity,
               'expires': expires, 'day': day, 'units': units, 'refunded': False, 'kind': kind, 'next_poll': 0}
        self.slots[key] = row
        self.attempts[attempt] = row
        if kind == 'video':
            self.active = attempt
            self.next_video = self.clock() + 30.1
        return {'canPost': True, 'attemptId': attempt}

    def event(self, attempt_id, event_type, **extra):
        row = self.attempts[attempt_id]
        if event_type == 'accepted':
            row.update(state='pending', videoId=extra['videoId'])
        elif event_type in ('completed', 'failed', 'abandoned'):
            row['state'] = event_type
            if self.active == attempt_id:
                self.active = None
        elif event_type == 'hard-rejected-429':
            if not row['refunded']:
                self.quota[row['day']]['images' if row['kind'] == 'image' else 'video_seconds'] -= row['units']
                row['refunded'] = True
            row['state'] = 'rejected'
            if self.active == attempt_id:
                self.active = None
            self.next_video = max(self.next_video, self.clock() + extra.get('retryAfterMs', 60000) / 1000)
        elif event_type == 'poll-throttle':
            row['next_poll'] = self.clock() + extra['retryAfterMs'] / 1000
        elif event_type == 'uncertain' and not row['videoId']:
            row['state'] = 'uncertain'
        return {'saved': True}

    def pollclaim(self, match, ordinal):
        row = self.status(match, 'video', ordinal)
        if not row or not row.get('videoId') or row.get('next_poll', 0) > self.clock():
            return {'canPoll': False, 'reason': 'Retry-After vigente o tarea no conocida'}
        return {'canPoll': True, 'videoId': row['videoId'], 'attemptId': row['attemptId']}
