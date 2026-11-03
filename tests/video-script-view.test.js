import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatScripts, readScript, scriptFile } from '../video-render/contract/youtube-script.js';

const MATCH = 'match-a';

const DOCUMENT = {
  matchId: MATCH,
  scripts: [
    {
      n: 1,
      title: 'Uno',
      words: 24,
      narration: [
        { beat: 'gancho', text: 'Abre el partido.' },
        { beat: 'fecha', text: 'Se juega el martes 3.' },
        { beat: 'dato', text: 'Dato uno.' },
        { beat: 'dato', text: 'Dato dos.' },
        { beat: 'proyeccion', text: 'Gana el local.' },
        { beat: 'cierre', text: 'Todo en goatlab.win.' },
      ],
    },
    { n: 2, words: 5, narration: 'Texto plano del guion.' },
  ],
};

function tree(t, document) {
  const root = mkdtempSync(join(tmpdir(), 'goatlab-scripts-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (document) {
    mkdirSync(join(root, 'public/data/youtube-scripts'), { recursive: true });
    writeFileSync(scriptFile(root, MATCH), JSON.stringify(document));
  }
  return root;
}

test('readScript returns null when the match has no script file', (t) => {
  assert.equal(readScript(tree(t), MATCH), null);
});

test('formatScripts lists every script with its labeled beats', (t) => {
  const root = tree(t, DOCUMENT);
  const block = formatScripts(root, MATCH);
  assert.match(block, /^guiones: 2 en public\/data\/youtube-scripts\/match-a\.json$/m);
  assert.match(block, /^### Guion 1 · 24 palabras$/m);
  assert.match(block, /^\*\*Uno\*\*$/m);
  assert.match(block, /^- Dato 1: Dato uno\.$/m);
  assert.match(block, /^- Dato 2: Dato dos\.$/m);
  assert.match(block, /^- Proyección: Gana el local\.$/m);
  assert.match(block, /^### Guion 2 · 5 palabras$/m);
  assert.match(block, /^- Guion: Texto plano del guion\.$/m);
});

test('formatScripts returns null without scripts', (t) => {
  assert.equal(formatScripts(tree(t, { matchId: MATCH, scripts: [] }), MATCH), null);
  assert.equal(formatScripts(tree(t), MATCH), null);
});
