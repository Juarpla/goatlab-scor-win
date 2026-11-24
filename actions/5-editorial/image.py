"""Reuse the production Agnes pool, shared quota and uncertain-request protection."""
import hashlib
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '3-media-creation'))
from agnes import ImagePool
from agnes_state import AgnesState


class EditorialAuthority(AgnesState):
    def guard(self, match, expires):
        # The Node orchestrator verifies the active D1 row before every image.
        identity = json.loads(Path(sys.argv[1]).read_text())
        if (identity['id'] != match or identity['retired']
                or time.time() - identity['observedAt'] > 60
                or not match.startswith('editorial-' + identity['slug'] + '-')):
            raise ValueError('editorial vigente no verificada')
        return {'editorial': True, 'slug': identity['slug'],
                'observedAtMs': identity['observedAt'] * 1000,
                'contextHash': hashlib.sha256(identity['title'].encode()).hexdigest()}


if __name__ == '__main__':
    try:
        identity = json.loads(Path(sys.argv[1]).read_text())
        folder = Path(sys.argv[1]).parent
        pool = ImagePool(folder / 'agnes.sqlite', state=EditorialAuthority())
        result = pool.generate(identity['id'], identity['index'], identity['prompt'], folder,
                               size='1K', ratio='16:9', expires_at=identity['expiresAt'],
                               attempt_deadline=time.time() + 420)
        print(json.dumps(result))
    except Exception as error:
        print(str(error) if isinstance(error, ValueError) else type(error).__name__, file=sys.stderr)
        sys.exit(1)
