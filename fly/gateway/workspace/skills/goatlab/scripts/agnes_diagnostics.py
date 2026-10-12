"""Small, sanitized provider observations; persistence never grants admission."""
import json
import os
import re
import sys
import time
import uuid


def safe_text(value, limit=256):
    text = str(value or '')
    for key, secret in os.environ.items():
        if secret and re.search(r'(KEY|TOKEN|SECRET|PASSWORD)$', key):
            text = text.replace(secret, '[redacted]')
    text = re.sub(r'https?://[^\s"<>]+', '[endpoint]', text)
    text = re.sub(r'(?i)(bearer\s+)[^\s"<>]+', r'\1[redacted]', text)
    text = re.sub(r'(?i)("(?:token|api[_-]?key|secret|authorization|password|prompt|id|(?:video|task|result|generation)[_-]?id|b64_json|base64)"\s*:\s*)"[^"\n]*"', r'\1"[redacted]"', text)
    return text[:limit]


def provider_diagnostic(state, kind, match, ordinal, record):
    body = record.get('body', {})
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except ValueError:
            if body.lstrip().startswith(('{', '[')):
                body = 'respuesta JSON incompleta; detalle de payload omitido'
    payload = body if isinstance(body, dict) else {}
    error = payload.get('error')
    error = error if isinstance(error, dict) else {}
    status = payload.get('status') or record.get('providerStatus') or ''
    progress = payload.get('progress', record.get('progress'))
    if not isinstance(progress, (int, float)) or isinstance(progress, bool) or not 0 <= progress <= 100:
        progress = None
    message = payload.get('message') or error.get('message') or (body if isinstance(body, str) else '')
    if not message and isinstance(payload.get('error'), str):
        message = payload['error']
    if payload.get('errorType'):
        message = str(payload['errorType']) + ': ' + str(message)
    stage = record.get('stage', '')
    if stage == 'retrieve-stop':
        message = str(message).split('; última consulta:', 1)[0]
    method = record.get('method') or ('POST' if stage in ('create', 'create-response') else 'GET' if stage in ('retrieve', 'retrieve-response') else 'NONE')
    compact = {'id': str(uuid.uuid4()), 'at': int(record.get('at', time.time()) * 1000),
               'runId': os.environ.get('AGNES_RUN_ID') or getattr(state, 'owner', 'local-run'),
               'runUrl': '', 'stage': safe_text(stage, 128), 'method': method,
               'httpStatus': record.get('httpStatus'), 'providerCode': safe_text(payload.get('code') or error.get('code'), 128),
               'message': safe_text(message), 'providerStatus': safe_text(status, 128), 'progress': progress,
               'requestId': safe_text(record.get('requestId'), 128), 'next': safe_text(record.get('next'), 128)}
    if os.environ.get('GITHUB_RUN_ID') and os.environ.get('GITHUB_REPOSITORY'):
        compact['runUrl'] = 'https://github.com/' + os.environ['GITHUB_REPOSITORY'] + '/actions/runs/' + os.environ['GITHUB_RUN_ID']
    print('agnes-' + kind + ': ' + json.dumps({'matchId': match, 'kind': kind, 'ordinal': ordinal,
          'attemptId': record.get('attemptId'), **compact}, ensure_ascii=False), file=sys.stderr, flush=True)
    persist = getattr(state, 'diagnostic', None)
    if persist and record.get('attemptId'):
        try:
            persist(record['attemptId'], compact)
        except Exception as error:
            print('agnes-diagnostic: ' + safe_text(f'{match}: no se pudo guardar diagnóstico; {error}; no repetir POST'), file=sys.stderr, flush=True)
    return compact
