"""Trusted Telegram identifiers. Voice intake bypasses the language model."""
import os
import re
from pathlib import Path


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
    voice = message.get('voice') or message.get('audio')
    command = str(message.get('text', '')).split(maxsplit=1)[0] if message.get('text') else ''
    start = command.split('@',1)[0] == '/start'
    if not voice and not start: return None
    allowed = set(os.environ.get('TELEGRAM_ALLOWED_USERS', '').split(','))
    if str(message.get('from', {}).get('id')) not in allowed:
        return {'ignored': True}
    chat = chat_id(message.get('chat', {}).get('id'))
    if message.get('chat', {}).get('type') != 'private': return None
    flow = Workflow(Path(state) / 'goatlab.sqlite')
    try:
        if start:
            # Reset only GoatLab; OpenClaw still handles the welcome and native session.
            flow.reset(chat)
            return None
        series=flow.current(chat)
        if not series: return None
        if series['closed']: return {'ignored':True}
        event = message.get('message_id')
        if isinstance(event, bool) or not isinstance(event, int) or event <= 0:
            raise ValueError('message_id original inválido')
        return {**flow.receive(chat, file_id(voice.get('file_id')), str(event)), 'chat': chat}
    finally:
        flow.db.close()
