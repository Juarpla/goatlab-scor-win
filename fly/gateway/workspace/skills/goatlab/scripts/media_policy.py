"""Match-scoped experiment shared with Actions and the creative director."""
import json
from pathlib import Path

CONFIG = json.loads((Path(__file__).resolve().parent.parent / 'lib/montage-experiment.json').read_text())

def clip_target(match_id):
    if CONFIG.get('mode') not in ('freedom', 'clips-first') or not (CONFIG.get('matches') is None or isinstance(CONFIG['matches'], list)):
        raise ValueError('Configuración de prueba de montaje inválida')
    return 3 if CONFIG['mode'] == 'clips-first' and (CONFIG['matches'] is None or match_id in CONFIG['matches']) else 2
