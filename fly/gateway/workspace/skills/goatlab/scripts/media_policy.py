"""Production target shared with Actions, independent of editorial direction."""
import json
from pathlib import Path

CONFIG = json.loads((Path(__file__).resolve().parent.parent / 'lib/montage-experiment.json').read_text())

def clip_target(match_id):
    if CONFIG.get('mode') not in ('freedom', 'clips-first') or not (CONFIG.get('matches') is None or isinstance(CONFIG['matches'], list)):
        raise ValueError('Configuración de prueba de montaje inválida')
    count = CONFIG.get('clips', 4)
    if type(count) is not int or not 1 <= count <= 4:
        raise ValueError('Objetivo de clips inválido')
    return count
