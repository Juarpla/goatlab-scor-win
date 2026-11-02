# Remotion authoring

Guide to the engine that wins the A/B test: Remotion 4.0.537, React 19 and the
local GoatLab kit. The plan is a single-file JSX module that the engine validates,
compiles and runs in Chromium.

## How the plan runs

1. `validateAuthoredPlan` parses the JSX with Babel and rejects imports, globals
   and forbidden APIs.
2. `bundleAuthored` wraps the code in a `GoatLabShort` composition:
   - `<Sequence durationInFrames={contentFrames}>` mounts your component.
   - It then adds a 1 s endcard with `brand.svg`.
   - It loads `LiberationSans-Bold.ttf` as `GoatLabLocal`.
3. `renderMedia` captures at 1080×1920, 30 fps, H.264/AAC, with a configurable
   `crf` (`RENDER_CRF`, default 20).

Your component does **not** draw the endcard or control total duration. Cover
`contentFrames` and let the engine close.

## Minimal skeleton

```jsx
import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from 'remotion';

export default function Piece(props) {
  return (
    <AbsoluteFill style={{ background: '#101412' }}>
      <Sequence durationInFrames={props.contentFrames}>
        <MyScene words={props.words} />
      </Sequence>
    </AbsoluteFill>
  );
}
```

`useCurrentFrame` inside a `Sequence` starts at 0 in that sequence. To time
absolute scenes, use `from` and `durationInFrames` on the parent `Sequence`.

## Patterns

### Photo scene with motion

```jsx
function Photo({ src, frames }) {
  return (
    <AbsoluteFill>
      <KenBurns src={src} durationInFrames={frames} from={{ scale: 1.02, x: 0, y: 0 }} to={{ scale: 1.13, x: 0, y: -30 }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(16,20,18,.05), rgba(16,20,18,.92))' }} />
      <AbsoluteFill style={{ padding: '160px 90px 340px', justifyContent: 'flex-end' }}>
        <div style={{ fontSize: 92, fontWeight: 800, color: '#F5F1E8' }}>TITLE</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
```

### Clip with overlay

```jsx
<Sequence from={690} durationInFrames={255}>
  <AbsoluteFill style={{ background: '#000' }}>
    <OffthreadVideo src={props.clips[0].src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, transparent, rgba(16,20,18,.9))' }} />
    <div style={{ position: 'absolute', left: 90, right: 90, bottom: 340 }}>
      <div style={{ fontSize: 82, fontWeight: 800, color: '#F5F1E8' }}>AHORA JUEGA EN SU CAMPO</div>
    </div>
  </AbsoluteFill>
</Sequence>
```

### Subtitles

```jsx
<Sequence durationInFrames={props.contentFrames}>
  <Captions
    words={props.words}
    maxWords={4}
    style={{ padding: '0 70px 300px' }}
    wordStyle={{ fontSize: 58, textShadow: '0 4px 18px rgba(0,0,0,.85)' }}
    activeStyle={{ color: '#ffe14a' }}
  />
</Sequence>
```

Use the fill `#ffe14a` and a black outline/shadow. Do not stack two subtitle layers
or add offsets: `words` already arrives in the final timeline.

### Real figure

```jsx
<StatCard label="ÚLTIMO CRUCE" value={4} unit="goles" source="Real Madrid CF" style={{ width: 430 }} />
```

`value` must come from `facts`. Do not invent figures or use percentages the match
does not support.

### Camera and color

```jsx
<CameraMove from={{ scale: 1, x: 0, y: 0 }} to={{ scale: 1.08, x: 0, y: -20 }} durationInFrames={300}>
  <Img src={props.photos[0].src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
</CameraMove>
<ColorWash colors={['#1B3A2A', '#101412']} opacity={0.12} />
```

`CameraMove` goes inside a `Sequence` to restart motion per scene.

### Transitions

`@remotion/transitions` is not in the allowed import list. For transitions,
animate opacity, `clipPath`, `transform` or use hard cuts. A cut on the voice
usually reads better than a slow fade.

## Rules the validator applies

- `version: 5`, `code` non-empty, maximum 200 KB.
- Duration within `MAX_FRAMES`; `scenes` within the content.
- `music` boolean; `visualStyle` one of the three values.
- Default export.
- Imports only from `react`, `remotion` and `goatlab-kit`, with the exact list.
- No `require`, `eval`, `Function`, `process`, `global`, `globalThis`, `window`,
  `document`, `fetch`, `XMLHttpRequest`, `WebSocket`, `Worker`, `navigator`,
  `localStorage`, `sessionStorage`, `setInterval`, `setTimeout`.

A validation error returns the message and does not render. Fix the plan; do not
change the engine.

## Performance

- `RENDER_WORKERS` splits frames across processes. 3 to 4 is a good point on a
  laptop; each worker opens its own Chromium.
- `CAPTURE_BUDGET_MS` and `CAPTURE_TIMEOUT_MS` must be set together. The first
  decides whether the render is considered viable; the second cancels capture.
- `RENDER_CRF`: 20 by default; 23 produces smaller files; 16 to 18 for maximum
  quality.
- `LAYOUT_CHECK=advisory` reports clipped text, text outside the canvas or text in
  covered areas without blocking delivery. Use it on the first render.
- Avoid dozens of simultaneous blur layers. If the budget runs out, simplify the
  most expensive scene, not the whole video.

## Common errors

| Symptom | Cause | Fix |
| --- | --- | --- |
| `compilación JSX` | disallowed import, syntax error or missing export | check imports and `export default` |
| `resource outside the job` | you used a URL or file that does not come from props | use `photos[].src`, `clips[].src`, `font` or `brand` |
| `duración fuera de límite` | `scenes` or `frames` out of range | fit `scenes` to the content |
| `plan version:5 y code JSX` | missing `code` or version | complete the JSON |
| Empty captions | `words` not passed to `Captions` | pass `props.words` |
| Black video | clip/photo not found or an opaque layer on top | check `src`, `zIndex` and layer order |
| Clipped text | safe area not respected | use `SafeArea` or padding 160/340/60/160 |

## Checklist before rendering

- [ ] The JSON parses and has `version: 5`, `music: true`, a valid `visualStyle`.
- [ ] `scenes` ends within `contentFrames / 30`.
- [ ] Default export and only allowed imports.
- [ ] Every usable clip appears at least once.
- [ ] 2 to 4 figures from `facts`, none invented.
- [ ] Subtitles with `props.words`, `#ffe14a` fill and black outline.
- [ ] Text inside the safe area; nothing critical under the bottom 320 px.
- [ ] No custom endcard: the engine adds the logo.
