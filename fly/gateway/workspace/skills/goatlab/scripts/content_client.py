"""Validated public content with a bounded cache; a series keeps its own snapshot."""
import json
import os
import time
import urllib.request
from pathlib import Path
from urllib.parse import quote, urlparse
from common import atomic_json

CATEGORIES = {'scripts': ('youtube-scripts', 10), 'image-prompts': ('image-prompts', 4), 'video-prompts': ('video-prompts', 2), 'motion-prompts': ('motion-prompts', None)}
KINDS = {
    'image-prompts': ['ball-duel','goal-action','supporters','stadium'],
    'video-prompts': ['push-in','tracking'],
    'motion-prompts': ['form','goals','clean-sheets','head-to-head','synthesis'],
}


def valid(data, category, match_id):
    if not isinstance(data, dict) or data.get('matchId') != match_id or not data.get('home') or not data.get('away'):
        return False
    rows = data.get('scripts' if category == 'scripts' else 'prompts')
    if not isinstance(rows, list):
        return False
    # Motion: el modelo decide la cantidad de escenas (2-10). Imágenes y vídeo, exacto.
    if category == 'motion-prompts':
        if not 2 <= len(rows) <= 10:
            return False
    elif len(rows) != CATEGORIES[category][1]:
        return False
    if category == 'scripts':
        return all(isinstance(r, dict) and r.get('n', i+1) == i+1 and isinstance(r.get('narration'), str) and r['narration'].strip() for i, r in enumerate(rows))
    if data.get('version') != 1 or data.get('category') != category:
        return False
    facts = {f['id'] for f in data.get('facts', []) if isinstance(f, dict) and isinstance(f.get('id'), str)}
    for i, r in enumerate(rows):
        if not isinstance(r, dict) or r.get('n') != i+1:
            return False
        if category == 'motion-prompts':
            if r.get('kind') not in KINDS[category]:
                return False
        elif r.get('kind') != KINDS[category][i]:
            return False
        if not (r.get('presentations') is None or r['presentations'] == ['editorial','statistical']):
            return False
        if not (isinstance(r.get('prompt'), str) and 180 <= len(r['prompt']) <= 12000 and '9:16' in r['prompt'] and isinstance(r.get('title'), str)):
            return False
        if category == 'motion-prompts' and not (isinstance(r.get('factIds'), list) and all(f in facts for f in r['factIds'])):
            return False
    return True


class ContentClient:
    def __init__(self, repo, state, base=None, fetch=None, clock=time.time):
        self.repo, self.cache = Path(repo), Path(state)/'content-cache'
        self.base = (os.environ.get('GOATLAB_CONTENT_BASE_URL', 'https://goatlab.win') if base is None else base).rstrip('/')
        self.fetch = fetch or self.download
        self.clock = clock

    def download(self, url):
        request = urllib.request.Request(url, headers={'User-Agent':'GoatLab-Content/1.0 (+https://goatlab.win)', 'Accept':'application/json'})
        with urllib.request.urlopen(request, timeout=10) as response:
            raw = response.read(1_000_001)
            if len(raw)>1_000_000: raise ValueError('contenido demasiado grande')
            return json.loads(raw)

    def cached(self, key, validator, path):
        cache = self.cache/f'{key}.json'
        if self.base:
            try:
                data = self.fetch(self.base + path)
                if not validator(data): raise ValueError('contenido público inválido o pendiente')
                self.cache.mkdir(parents=True, exist_ok=True)
                for old in self.cache.glob('*.json'):
                    if old.stat().st_mtime < self.clock()-86400: old.unlink()
                files = sorted(self.cache.glob('*.json'), key=lambda p:p.stat().st_mtime)
                size = sum(p.stat().st_size for p in files)
                while files and size + len(json.dumps(data).encode()) > 3_000_000:
                    old = files.pop(0); size -= old.stat().st_size; old.unlink()
                atomic_json(cache, data)
                return data
            except (OSError, ValueError, TypeError): pass
        try:
            data = json.loads(cache.read_text())
            if cache.stat().st_mtime >= self.clock()-86400 and validator(data): return data
        except (OSError, ValueError): pass
        return None

    def get(self, match_id, category):
        if not match_id or Path(match_id).name != match_id or match_id in {'.','..'}: raise ValueError('partido inválido')
        data = self.cached(f'{match_id}-{category}', lambda d:valid(d, category, match_id), f'/partido/{quote(match_id, safe="")}/{category}.json')
        if data: return data
        try:
            data = json.loads((self.repo/'public/data'/CATEGORIES[category][0]/f'{match_id}.json').read_text())
            return data if valid(data, category, match_id) else None
        except (OSError, ValueError): return None

    def list(self):
        def valid_index(data):
            if not isinstance(data, dict) or data.get('version') != 1 or not isinstance(data.get('matches'), list): return False
            return all(isinstance(m, dict) and isinstance(m.get('matchId'), str) and Path(m['matchId']).name == m['matchId'] and m.get('home') and m.get('away') for m in data['matches'])
        index = self.cached('index', valid_index, '/content-index.json')
        if index:
            return index['matches']
        rows = []
        for path in sorted((self.repo/'public/data/youtube-scripts').glob('*.json')):
            try:
                data = json.loads(path.read_text())
                if valid(data, 'scripts', path.stem): rows.append(data)
            except (OSError, ValueError): pass
        return rows

    def package(self, match_id):
        script = self.get(match_id, 'scripts')
        if not script: raise ValueError('no hay diez guiones válidos para el partido')
        content = {c:self.get(match_id, c) for c in KINDS}
        return {**script, 'content':content, 'missingCategories':[c for c,d in content.items() if d is None]}
