# Remotion authoring contract

Technical reference for the local version 5 plan. Read this before writing JSX.
Creative choices belong to [creative.md](creative.md); fixed identity belongs to
[brand.md](brand.md). Examples here demonstrate APIs, not a visual template.

## Plan and execution

```json
{
  "version": 5,
  "visualStyle": "editorial",
  "music": true,
  "scenes": [{ "start": 0, "end": 4.5 }],
  "notes": "A brief concept and media-selection rationale for this recording.",
  "code": "import React from 'react'; export default function Piece(props) { /* JSX */ }"
}
```

`visualStyle` accepts `editorial`, `documentary` or `trailer`. It is a descriptive
label, not a template selector. `notes` is author documentation; it is not consumed
by the renderer or validated as a required field.

`scenes` is a non-empty list of absolute intervals used for validation/review
metadata, not an edit decision list. Each interval must have `0 <= start < end`
inside the content (`contentFrames / fps`, approximately `voiceSeconds / rate + 1`).
The local `reviewTimes()` helper currently uses a fixed sample independent of
these intervals; the manual QA in the skill samples the MP4 separately. Neither
mechanism checks that the code follows the declared scene intervals.

`validateAuthoredPlan` parses JSX with Babel, checks syntax, imports and globals,
then `bundleAuthored` compiles it for Chromium. The engine mounts the default
export for `contentFrames`, loads the local font and appends the closing identity.
The component neither controls total duration nor draws the closing card.

The validator accepts a boolean `music` and an optional valid `visualStyle`; the
final-video workflow requires `music: true` and an explicit style. Technical
fixtures may exercise a wider engine interface than a delivered video.

Delivery dimensions, frame rate, voice policy and closing duration are defined
in `video-render/contract/short-format.js`. `DIRECTOR_ENDCARD_SECONDS` governs
version 5; `ENDCARD_SECONDS` is retained for legacy plans. Folder validation is in
`video-render/contract/layout.js`. Read these files when changing those contracts.

## Component props

| Prop | Shape |
| --- | --- |
| `frames` | total frames, including the endcard |
| `contentFrames` | content frames, excluding the endcard |
| `photos` | `[{src, backdrop, focusBlur, width, height}]` |
| `clips` | `[{src, width, height, duration}]` |
| `words` | `[{word, start, end}]`, in seconds on the final timeline |
| `facts` | real match figures supplied by the media pack |
| `match` | match text |
| `brandName`, `brandUrl` | official name and domain |
| `font`, `brand` | local asset paths for this job |

Use resource paths from props. The local media adapters reject resources outside
the job and Chromium has a network CSP. The font family is
`GoatLabLocal, sans-serif`.

`words` already includes the intro offset. Keep a single `Captions` layer on the
content's absolute timeline. A nested `Sequence` changes the frame origin; do not
restart full-track captions in each shot or add another intro offset.

The script is the reference text; transcription provides the clock. Fix reference
words rather than editing timings. The CLI reports its chosen script and match
percentage; the workflow defines correction and fallback handling.

## Imports and runtime

The exact allowlists live in
`video-render/render/remotion/authored-composition.mjs`.

- From `react`: React and standard hooks.
- From `remotion`: `AbsoluteFill`, `Sequence`, `Series`, `Freeze`, `Loop`, `Img`,
  `OffthreadVideo`, `Html5Video`, `Video`, `useCurrentFrame`, `useVideoConfig`,
  `interpolate`, `interpolateColors`, `spring`, `Easing`, `random`, `getInputProps`.
- From `goatlab-kit`: `Captions`, `FitText`, `SafeArea`, `KenBurns`, `StatCard`,
  `CameraMove`, `ColorWash`, `FilmGrain`, `phrases`, `wordAt`, `fitFontSize`.

`Video` aliases the local `OffthreadVideo` adapter. Clips are always muted; the
pipeline owns the soundtrack. Animate deterministically with `useCurrentFrame`,
`interpolate` or `spring`. CSS, inline SVG, masks, compositing and 3D transforms
are available within this runtime; additional packages are not.

No dynamic imports, re-exports, `require`, `eval`, `Function`, Node globals,
direct DOM, network APIs, browser storage, workers or timers. No iframe/script or
other external resource loading. `@remotion/transitions` is not available; animate
supported properties or use cuts. A rejected plan must be fixed rather than
relaxing the validator.

## Kit APIs

The kit provides tools, not mandatory components or arrangements. Its source is
`video-render/render/remotion/kit/goatlab-kit.jsx`.

- `Captions({words, style, wordStyle, activeStyle, maxWords, render})`: draws the
  active phrase. `render(group, index)` replaces the default markup and must
  retain the caption identity. `maxWords` defaults to 4 and can be changed.
- `FitText({children, maxWidth, max, min, style})`: fits font size to width.
- `SafeArea({children, style})`: leaves 160 px top, 340 bottom, 60 left, 160 right.
- `KenBurns({src, from, to, durationInFrames, style})`: transforms a photo.
- `StatCard({label, value, unit, source, countUp, style})`: displays a figure;
  the default counter rounds to integers. Set `countUp={false}` for decimal
  values or implement formatting that preserves the supplied figure.
- `CameraMove({children, from, to, durationInFrames, startFrame, style})`:
  transforms media or a group. `from`/`to` use `scale`, `x`, `y`.
- `ColorWash({colors, opacity})`: overlays one or two colors.
- `FilmGrain({opacity, seed})`: deterministic grain.
- `phrases(words)`, `wordAt(words, seconds)`, `fitFontSize(text, options)`:
  text/timing helpers.

At 1080×1920, keep text inside the safe area and use at least 40 px for information
that must be read on a phone, including labels and sources. `StatCard` can be
restyled or replaced with custom JSX. The layout probe warns; it does not prove
legibility or check whether an overlay hides a player or the ball.

## Minimal API example

This example only shows media paths, duration and captions. Author the actual
composition from the creative direction and the recording.

```jsx
import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo } from 'remotion';
import { Captions } from 'goatlab-kit';

export default function Piece(props) {
  const mediaStyle = { width: '100%', height: '100%', objectFit: 'cover' };
  return (
    <AbsoluteFill>
      {props.clips.length > 0
        ? <OffthreadVideo src={props.clips[0].src} style={mediaStyle} />
        : <Img src={props.photos[0].src} style={mediaStyle} />}
      <Captions words={props.words} />
    </AbsoluteFill>
  );
}
```

For a shot, use `<Sequence from={startFrame} durationInFrames={shotFrames}>`.
`useCurrentFrame()` inside it starts at 0. Put camera helpers inside the shot's
sequence to restart their movement there. Keep captions outside shot sequences.
Trim a clip with `startFrom`/`endAt`; `Loop` and `Freeze` are available when needed.
Keep a clip mounted long enough to cover its sequence or explicitly manage its
end; the minimal example does not plan coverage for a longer voice.

## Validation and performance

- Version 5, non-empty JSX, at most 200 KB, default-exported React component.
- Integer frame duration inside the delivery contract; valid review intervals.
- Allowed imports and APIs; all media comes from props.
- `RENDER_WORKERS` sets capture concurrency. Each worker opens Chromium.
- Set `CAPTURE_BUDGET_MS` and `CAPTURE_TIMEOUT_MS` together: one controls capture
  viability and the other cancels the operation.
- `RENDER_CRF` defaults to 20; the workflow uses 23 for smaller deliveries.
- `LAYOUT_CHECK=advisory` reports layout problems without blocking capture.
- If capture exceeds its budget, measure the expensive scene and adjust its cost
  or the local budget before retrying. Availability of an effect is not a reason
  to use it.

## Common errors

| Symptom | Cause | Fix |
| --- | --- | --- |
| `compilación JSX` | import, syntax or export error | check allowlists and default export |
| `resource outside the job` | path does not come from props | use the supplied media/asset paths |
| `duración fuera de límite` | invalid frame duration | check the format contract |
| `tiempos de revisión fuera del contenido` | review interval out of range | fit `scenes` to the content |
| Empty/shifted captions | missing words or local sequence clock | use full-track words on the absolute timeline |
| Black video | missing source or opaque covering layer | check resource, layer order and coverage |
| Clipped text | layout outside visible area | use safe-area dimensions and inspect the MP4 |

## Technical checks before capture

Parse the JSON, validate the plan with the engine and confirm timing coverage,
resource indices, the caption timeline and the engine-owned closing. Then apply
[creative.md](creative.md) during visual review; compiler success cannot validate
editorial decisions.
