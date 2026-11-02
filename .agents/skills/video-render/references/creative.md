# Creative contract

A GoatLab Short is football analytics at 1080×1920: one voice, a bank of match
images and clips, and an original composition that turns the narration into
images. There is no mandatory template and no closed catalog of graphics.

## Material

The media pack (`public/data/media-pack/<id>.json`) contains:

- `assets`: up to 4 reference images from Agnes.
- `clips`: match clips, usually 4, about 6.5 s at 720×1280.
- `facts`: real figures with source and sample size.
- `match`, `home`, `away`, `competition`, `kickoff`.

Images illustrate; clips show. Neither images nor clips prove a result or a
lineup: do not present them as such.

## Plan

```json
{
  "version": 5,
  "visualStyle": "editorial | documentary | trailer",
  "music": true,
  "scenes": [{ "start": 0, "end": 4.5 }],
  "code": "JSX module with export default"
}
```

- `scenes` are absolute times for sampling the review, not a structure. They must
  fit inside the content: `0 … voiceSeconds / rate + 1`.
- `music` must be `true`.
- `code` is compiled in Chromium and runs with the job props. Maximum 200 KB.
- The engine adds the 1 s endcard with the logo. The component covers only
  `contentFrames`.

## Props

| Prop | Shape |
| --- | --- |
| `frames` | total frames, including the endcard |
| `contentFrames` | content frames, excluding the endcard |
| `photos` | `[{src, backdrop, focusBlur, width, height}]` |
| `clips` | `[{src, width, height, duration}]` |
| `words` | `[{word, start, end}]`, already offset by 0.5 s |
| `facts` | real match figures |
| `match` | match text |
| `brandName`, `brandUrl` | `GoatLab`, `goatlab.win` |
| `font`, `brand` | local files for the job |

## Imports

From `react`: React and standard hooks.

From `remotion` (4.0.537): `AbsoluteFill`, `Sequence`, `Series`, `Freeze`,
`Loop`, `Img`, `OffthreadVideo`, `Html5Video`, `Video`, `useCurrentFrame`,
`useVideoConfig`, `interpolate`, `interpolateColors`, `spring`, `Easing`, `random`,
`getInputProps`.

From `goatlab-kit`: `Captions`, `FitText`, `SafeArea`, `KenBurns`, `StatCard`,
`CameraMove`, `ColorWash`, `FilmGrain`, `phrases`, `wordAt`, `fitFontSize`.

`Video` is the local alias of `OffthreadVideo`. No external network, dynamic
imports, global DOM or Node APIs.

## Kit

- `Captions({words, style, wordStyle, activeStyle, maxWords, render})` draws the
  active phrase. `render(group, index)` replaces it.
- `FitText({children, maxWidth, max, min})` fits the size to the width.
- `SafeArea({children, style})` leaves 160/340/60/160 px.
- `KenBurns({src, from, to, durationInFrames, style})` moves and zooms a photo.
- `StatCard({label, value, unit, source, countUp, style})` counts up a figure.
- `CameraMove({children, from, to, durationInFrames, startFrame, style})` moves
  photos, clips or groups. `from`/`to` use `scale`, `x`, `y`.
- `ColorWash({colors, opacity})` overlays one or two colors.
- `FilmGrain({opacity, seed})` adds deterministic grain.
- `phrases(words)`, `wordAt(words, seconds)`, `fitFontSize(text, options)`.

The kit does not define a style. You may combine it with your own code or not use
it at all.

## Visual direction

- Vivid color, high saturation, brand green present.
- Bright, sharp image. No dark passages, crushed blacks or heavy vignettes.
- Blur only on backgrounds, transitions and graphic layers; never on the subject.
- Subtitles `#ffe14a` with a black outline, readable on a phone.
- Dark green `#101412` belongs to the endcard, not to the content.
- Vary concept, framing, rhythm and transitions between audios. Do not repeat a
  template with only the text changed.

## Format areas

1080×1920 canvas. The Shorts UI covers about 320 px at the bottom and about 140 px
on the right side from 700 px height down. Text must be readable from 40 px. The
kit safe area is 160 px top, 340 px bottom, 60 px left and 160 px right. The layout
check is a warning, not a block.

## Clips and facts

- Every usable clip appears at least once.
- Audio shorter than the sum of clips: trim with `startFrom`/`endAt`.
- Audio longer: reuse with `Loop` or `Freeze`.
- Use 2 to 4 figures from `facts`; never invent statistics.
- Distinguish illustration from match evidence.

## Review

Before delivering, sample at least 5 frames plus the endcard and check: subtitles
readable and inside the safe area, vivid and sharp image, recognizable clips,
endcard with the logo, no accidental black frames. If something fails, edit the
plan and render another variant.
