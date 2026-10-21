"""Trusted Telegram identifiers. Voice intake bypasses the language model."""
import json
import os
import re
from pathlib import Path
from common import request_json


def access_control(path, payload):
    return request_json(os.environ.get('UI_ACCESS_CONTROL_URL', 'http://127.0.0.1:4004') + path,
                        payload, headers={'Authorization': 'Bearer ' + os.environ.get('TELEGRAM_WEBHOOK_SECRET', '')}, timeout=15)


def chat_id(value):
    value = str(value).removeprefix('telegram:')
    if not re.fullmatch(r'-?[1-9][0-9]{0,19}', value):
        raise ValueError('chat de Telegram inválido')
    return value


def file_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,256}', value):
        raise ValueError('se requiere el file_id de Telegram; una ruta local no es un file_id')
    return value


def record_feedback(state, chat, request_id, rating=None, reason=None, callback_id=None, prompt_id=None):
    from common import atomic_json
    path = Path(state) / 'director-memory' / f'{chat}.json'
    data = {'items': [], 'prompts': {}, 'callbacks': []}
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        pass
    callbacks = data.setdefault('callbacks', [])
    if callback_id and callback_id in callbacks:
        return {'duplicate': True, **data}
    if callback_id:
        callbacks.append(callback_id)
        data['callbacks'] = callbacks[-200:]
    items = data.setdefault('items', [])
    item = next((entry for entry in items if entry.get('requestId') == request_id), None)
    if item is None:
        item = {'requestId': request_id, 'rating': rating, 'concept': None}
        items.append(item)
    if rating is not None:
        item['rating'] = rating
    if reason is not None:
        item['reason'] = str(reason)[:500]
    data['items'] = items[-60:]
    if prompt_id:
        data.setdefault('prompts', {})[str(prompt_id)] = request_id
    atomic_json(path, data)
    return data


def ingest(update, state):
    from workflow import Workflow
    allowed = set(os.environ.get('TELEGRAM_ALLOWED_USERS', '').split(','))
    query = update.get('callback_query')
    if query and str(query.get('data') or '').startswith('fb:'):
        sender = str(query.get('from', {}).get('id'))
        message = query.get('message') or {}
        if sender not in allowed or message.get('chat', {}).get('type') != 'private':
            return {'ignored': True}
        parts = str(query.get('data')).split(':')
        if len(parts) != 3 or parts[1] not in ('up', 'down') or not re.fullmatch(r'[a-f0-9]{32}', parts[2]):
            return {'ignored': True}
        chat = chat_id(message.get('chat', {}).get('id'))
        rating = 1 if parts[1] == 'up' else -1
        stored = record_feedback(state, chat, parts[2], rating, callback_id=query.get('id'))
        from common import telegram
        try:
            telegram('answerCallbackQuery', {'callback_query_id': query.get('id'), 'text': 'Anotado'})
        except Exception:
            pass
        if rating == -1 and not stored.get('duplicate'):
            try:
                sent = telegram('sendMessage', {'chat_id': chat, 'text': '¿Qué no te gustó? Responde a este mensaje; es opcional.', 'reply_markup': {'force_reply': True}})
                record_feedback(state, chat, parts[2], prompt_id=sent.get('message_id'))
            except Exception:
                pass
        return {'ok': True}
    message = update.get('message', {})
    if not message: return None  # native inline-button handling
    voice = message.get('voice') or message.get('audio')
    command = str(message.get('text', '')).split(maxsplit=1)[0] if message.get('text') else ''
    start = command.split('@',1)[0] == '/start'
    allowed = set(os.environ.get('TELEGRAM_ALLOWED_USERS', '').split(','))
    if str(message.get('from', {}).get('id')) not in allowed:
        return {'ignored': True}
    chat = chat_id(message.get('chat', {}).get('id'))
    if message.get('chat', {}).get('type') != 'private': return {'ignored': True}
    reply = (message.get('reply_to_message') or {}).get('message_id')
    if message.get('text') and reply:
        memory = Path(state) / 'director-memory' / f'{chat}.json'
        try:
            request = json.loads(memory.read_text()).get('prompts', {}).get(str(reply))
        except (OSError, ValueError):
            request = None
        if request:
            record_feedback(state, chat, request, reason=message.get('text'))
            return {'ok': True}
    if start:
        event = update.get('update_id')
        if isinstance(event, bool) or not isinstance(event, int) or event < 0:
            raise ValueError('update_id original requerido para /start')
        # Reset, idempotence, welcome and credentials stay outside the LLM.
        return access_control('/start', {'chat': chat, 'event': event})
    if not voice: return None
    flow = Workflow(Path(state) / 'goatlab.sqlite')
    try:
        series=flow.current(chat)
        if not series: return None
        if series['closed']: return {'ignored':True}
        event = message.get('message_id')
        if isinstance(event, bool) or not isinstance(event, int) or event <= 0:
            raise ValueError('message_id original inválido')
        return {**flow.receive(chat, file_id(voice.get('file_id')), str(event)), 'chat': chat}
    finally:
        flow.db.close()


def note_activity(update):
    """Inbound user events count; polls, health checks and UI pings do not."""
    message = update.get('message') or update.get('callback_query', {}).get('message', {})
    sender = update.get('message', {}).get('from') or update.get('callback_query', {}).get('from', {})
    if message.get('chat', {}).get('type') == 'private' and str(sender.get('id')) in os.environ.get('TELEGRAM_ALLOWED_USERS', '').split(','):
        event = update.get('update_id')
        if isinstance(event, int) and not isinstance(event, bool) and event >= 0:
            access_control('/activity', {'event': event})
