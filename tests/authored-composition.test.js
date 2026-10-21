import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authoredProps, validateAuthoredPlan, compositionCsp } from '../fly/render/authored-composition.mjs';
import { recentDesigns, authoringKnowledge } from '../fly/gateway/creative-director.mjs';
import { reviewTimes } from '../fly/render/creative-job.mjs';

const plan = { version: 5, code: `import React from 'react';import {AbsoluteFill,useCurrentFrame,interpolate} from 'remotion';
export default function Piece(){const f=useCurrentFrame();return <AbsoluteFill style={{display:'grid',gridTemplateColumns:'1fr 2fr 1fr'}}><svg viewBox="0 0 100 100"><path d="M0 80L90 10" fill="none" stroke="lime"/></svg><div style={{opacity:interpolate(f,[0,20],[0,1])}}>Gol</div></AbsoluteFill>}`, scenes: [{ start: 0, end: 54 }], music: false };

test('authored JSX allows original transparent layouts, zero media and exactly 55 seconds', () => {
  const prepared = { frames: 1650, photos: [], clips: [], words: [{ word: 'Gol', start: .5, end: 1 }] };
  const props = authoredProps(prepared, plan);
  assert.equal(props.contentFrames, 1620);
  assert.deepEqual(props.photos, []);
  assert.equal(props.plan.code, plan.code);
  const many = authoredProps({ ...prepared, photos: Array.from({ length: 11 }, () => ({ src: 'x.jpg' })), clips: Array.from({ length: 7 }, () => ({ src: 'y.mp4' })) }, plan);
  assert.equal(many.photos.length, 11); assert.equal(many.clips.length, 7);
  assert.throws(() => authoredProps({ ...prepared, frames: 1651 }, plan), /duración/);
});

test('generated code cannot import host modules or trigger dynamic module loading', () => {
  for (const code of ["import fs from 'node:fs';export default ()=>null", "export default ()=>import('x')", "export default ()=>eval('x')", "export default ()=>process.env", "export * from 'node:fs';export default ()=>null", "import * as R from 'remotion';export default ()=>null"])
    assert.throws(() => validateAuthoredPlan({ ...plan, code }, 1650));
  assert.throws(() => validateAuthoredPlan({ ...plan, code: 'export default () => <div>' }, 1650), SyntaxError);
  assert.match(compositionCsp(), /default-src 'none'/);
  assert.match(compositionCsp(), /frame-src 'none'/);
  validateAuthoredPlan({ ...plan, code: "import {Captions} from 'goatlab-kit';export default ()=>null" }, 1650);
  assert.throws(() => validateAuthoredPlan({ ...plan, code: "import {Unknown} from 'goatlab-kit';export default ()=>null" }, 1650), /goatlab-kit/);
});

test('advisory samples stay bounded regardless of scenes and include the closing logo', () => {
  for (const duration of [2.033333333, 12, 28.133333333, 55]) {
    const times = reviewTimes(plan, duration);
    assert.equal(times.length, 8);
    assert.equal(new Set(times).size, 8);
    assert.ok(times.some(t => t >= duration - 1));
    assert.ok(times.every(t => t >= 0 && t < duration));
    assert.deepEqual(times, reviewTimes({ scenes: Array.from({ length: 100 }, () => ({ start: 0, end: 1 })) }, duration));
  }
});

test('creative memory stays within a chat and excludes the current request', t => {
  const root = mkdtempSync(join(tmpdir(), 'goatlab-style-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, chatId, requestId, notes] of [['a', 'one', 'prior', 'Tres paneles'], ['b', 'two', 'private', 'Privado'], ['c', 'one', 'current', 'Actual']]) {
    const dir = join(root, name.repeat(64)); mkdirSync(dir);
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ chatId, requestId, history: [{ at: 1, result: { plan, notes } }] }));
  }
  assert.deepEqual(recentDesigns(root, 'one', 'current').map(x => x.concept), ['Tres paneles']);
});

test('authoring turns preload both pinned skills before asking the model to write JSX',()=>{const text=authoringKnowledge();assert.match(text,/name: remotion-create/);assert.match(text,/name: remotion-markup/);assert.match(text,/useCurrentFrame/);});
