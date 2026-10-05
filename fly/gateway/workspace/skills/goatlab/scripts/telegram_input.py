"""Trusted Telegram identifiers. Voice intake bypasses the language model."""
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


def ingest(update, state):
    from workflow import Workflow
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
