import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { GoatLabShort } from './short.jsx';
import { FPS, FRAME_W, FRAME_H } from '../../../src/lib/short-format.js';
const Root = () => <Composition id="GoatLabShort" component={GoatLabShort} fps={FPS} width={FRAME_W} height={FRAME_H}
  durationInFrames={270} defaultProps={{ frames: 270, photos: [], clips: [], words: [], facts: [], motionPrompts: [], plan: { scenes: [] } }}
  calculateMetadata={({ props }) => ({ durationInFrames: props.frames })} />;
registerRoot(Root);
