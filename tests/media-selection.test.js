import test from 'node:test';
import assert from 'node:assert/strict';
import { relevantAssets } from '../src/lib/media.js';
import { telegramCaption } from '../src/lib/youtube.js';

test('metadata establishes relevance and diversity; the search query alone never identifies a team', () => {
  const asset = (id, title, motive = 'training') => ({ id, url: `https://example.test/${id}.jpg`, query: 'Alpha FC football', title, motive, width: 1472, height: 2624 });
  const selected = relevantAssets([
    ...Array.from({ length: 12 }, (_, i) => asset(i, 'Alpha FC football training')),
    asset('away', 'Beta FC football training'), asset('fans', 'Alpha FC supporters', 'fans'),
    asset('context', 'Soccer football pitch', 'scene'), asset('wrong', 'Landscape mountain')
  ], { home: 'Alpha FC', away: 'Beta FC' });
  assert.ok(selected.slice(0, 4).some(a => a.id === 'away'));
  assert.ok(selected.slice(0, 4).some(a => a.id === 'fans'));
  assert.ok(selected.slice(0, 4).some(a => a.selection.contextOnly));
  assert.ok(!selected.some(a => a.id === 'wrong'));
});

test('long credits use an attachment notice while preserving the generated-image disclosure', () => {
  const caption = telegramCaption({ title: 'Título', hook: 'Gancho', musicCredit: 'Música CC BY 4.0', attribution: `${'Autor CC BY 4.0\n'.repeat(120)}Imágenes generadas con IA — Agnes` });
  assert.ok(caption.length <= 1024);
  assert.match(caption, /Agnes/);
  assert.match(caption, /archivo adjunto/);
});
