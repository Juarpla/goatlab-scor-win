"""Validated public content with a bounded cache; a series keeps its own snapshot."""
import json
import os
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlparse
from zoneinfo import ZoneInfo
from common import atomic_json

LIMA = ZoneInfo('America/Lima')
WEEKDAYS = ('lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo')
MONTHS = ('enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre')

CATEGORIES = {'scripts': ('youtube-scripts', 10), 'image-prompts': ('image-prompts', 4), 'video-prompts': ('video-prompts', 2)}
KINDS = {
    'image-prompts': ['ball-duel','goal-action','supporters','stadium'],
    'video-prompts': ['push-in','tracking'],
}


def valid(data, category, match_id):
    if category not in CATEGORIES or not isinstance(data, dict) or data.get('matchId') != match_id or not data.get('home') or not data.get('away'):
        return False
    rows = data.get('scripts' if category == 'scripts' else 'prompts')
    if not isinstance(rows, list):
        return False
    if len(rows) != CATEGORIES[category][1]:
        return False
    if category == 'scripts':
        return all(isinstance(r, dict) and r.get('n', i+1) == i+1 and isinstance(r.get('narration'), str) and r['narration'].strip() for i, r in enumerate(rows))
    if data.get('version') != 1 or data.get('category') != category:
        return False
    for i, r in enumerate(rows):
        if not isinstance(r, dict) or r.get('n') != i+1:
            return False
        if r.get('kind') != KINDS[category][i]:
            return False
        if not (r.get('presentations') is None or r['presentations'] == ['editorial','statistical']):
            return False
        if not (isinstance(r.get('prompt'), str) and 180 <= len(r['prompt']) <= 12000 and '9:16' in r['prompt'] and isinstance(r.get('title'), str)):
            return False
    return True


def parse_kickoff(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(LIMA)


def competition_names(repo):
    try:
        data = json.loads((Path(repo) / 'public/data/leagues.json').read_text())
        leagues = data.get('leagues') if isinstance(data, dict) else None
        return {key: row.get('name') or key for key, row in (leagues or {}).items() if isinstance(row, dict)}
    except (OSError, ValueError, AttributeError):
        return {}


def order_matches(matches, now=None):
    """Upcoming matches first, by kickoff. A Lima evening is not the next UTC day."""
    moment = datetime.fromtimestamp(time.time() if now is None else now, tz=timezone.utc).astimezone(LIMA)
    dated, undated = [], []
    for match in matches:
        local = parse_kickoff(match.get('kickoff'))
        if local is None:
            undated.append(match)
            continue
        if local <= moment:
            continue
        dated.append((local, match))
    dated.sort(key=lambda item: item[0])
    ordered = [match for _, match in dated] + undated
    return ordered


def match_summary(match, number, names=None):
    """Agent-facing row. The Lima day replaces the UTC date prefix of the kickoff."""
    local = parse_kickoff(match.get('kickoff'))
    labels = names or {}
    row = {
        'number': number,
        'matchId': match.get('matchId'),
        'home': match.get('home'),
        'away': match.get('away'),
        'competition': labels.get(match.get('competition')) or match.get('competition'),
    }
    if local is not None:
        row['day'] = f'{WEEKDAYS[local.weekday()].capitalize()} {local.day} de {MONTHS[local.month - 1]}'
        row['time'] = local.strftime('%H:%M')
    return row


def list_text(matches, names=None):
    """One block per Lima date, one match per line, chronological across the list."""
    lines, current = [], None
    labels = names or {}
    for index, match in enumerate(matches, 1):
        local = parse_kickoff(match.get('kickoff'))
        home, away = match.get('home') or '', match.get('away') or ''
        if local is None:
            lines.append(f'{index}. {home} vs {away}')
            continue
        day = f'{WEEKDAYS[local.weekday()].capitalize()} {local.day} de {MONTHS[local.month - 1]}'
        if day != current:
            if lines:
                lines.append('')
            lines.append(day)
            current = day
        competition = labels.get(match.get('competition')) or match.get('competition') or ''
        tail = f' · {competition} · {local.strftime("%H:%M")}' if competition else f' · {local.strftime("%H:%M")}'
        lines.append(f'{index}. {home} vs {away}{tail}')
    return '\n'.join(lines)


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
        if category not in CATEGORIES: raise ValueError('categoría desconocida')
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
