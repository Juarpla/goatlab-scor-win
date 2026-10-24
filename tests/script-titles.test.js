import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeScriptTitles } from '../src/lib/script-titles.js';
import { shortTitle } from '../src/lib/youtube.js';
test('legacy titles five and ten are normalized without changing any other script data', async()=>{
 const data = JSON.parse(await readFile('public/data/youtube-scripts/aston-villa-vs-manchester-city-2026-10-24.json'));
 const old = structuredClone(data);
 for (const script of data.scripts) if ([5,10].includes(script.n)) script.title = 'Título anterior';
 const fixed=normalizeScriptTitles(data);
 assert.deepEqual(fixed.scripts.map(({title,...rest})=>rest), old.scripts.map(({title,...rest})=>rest));
 for (const script of fixed.scripts.filter(s=>[5,10].includes(s.n))) assert.equal(script.title,shortTitle({...data,n:script.n,hook:script.hook}));
 assert.deepEqual(normalizeScriptTitles(fixed),fixed);
});
