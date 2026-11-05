---
name: video-render
description: >-
  Render a GoatLab Short locally from a voice track and a match media pack.
  Pick the match, identify and align the voice, author an original Remotion
  composition, render, review the result and deliver the MP4. Use when the user
  asks for a local GoatLab video, a Short, or to render an audio track.
---

# GoatLab video-render

Local GoatLab Shorts renderer. Remotion is the only engine: transcription,
script alignment, media preparation, JSX composition, render and mix run on this
machine, with no remote worker. HyperFrames was dropped after the 2026-11-01 A/B
test (same quality, more weight and an extra toolchain).

## Delivery contract

- 1080×1920, 30 fps, H.264 with AAC.
- 55 s maximum: 0.5 s intro + voice + 0.5 s outro + 1 s endcard with logo.
- Spanish subtitles, readable and synchronized with `words`.
- Background music is mandatory: `plan.music: true`.
- One video per audio.
- Input audios: `video-render/audios/<id>/`; fixtures live in
  `video-render/audios/tests/` (`tests` is a reserved id).
- Deliveries: `video-render/videos/<id>/`.
- The only fixed editorial element is the GoatLab logo in the last second.
- Permanent visual preference: vivid color, sharp and well-lit image, no dark or
  murky passages. `references/creative.md` turns this into rules.

## Paths

| What | Where |
| --- | --- |
| Render CLI | `video-render/cli/render.mjs` |
| Pipeline | `video-render/pipeline/` (stages 00–10) |
| Renderer registry | `video-render/render/index.mjs` |
| Remotion project, kit and assets | `video-render/render/remotion/` |
| Plans, QA and references | `video-render/work/<id>/<slug>/` |
| Delivered MP4s | `video-render/videos/<id>/` |
| Recipes (manifest and plan) | `video-render/work/<id>/` |
| Audio fixtures (versioned) | `video-render/audios/tests/` |
| Layout check | `pnpm video:layout` |

`<slug>` is a short kebab-case label for the audio, for example `script-3` or the
file name. Never reuse a slug for another audio.

## How timing works

The YouTube script is the master text; Mistral provides the clock.

1. `video-render/pipeline/02-transcribe.mjs` sends a 16 kHz mono FLAC to Mistral
   (Voxtral) with `timestamp_granularities=word`. If Mistral fails, takes longer
   than 45 s or hears nothing, local whisper.cpp runs.
2. `video-render/pipeline/03-reference-timing.mjs` aligns the script tokens with the
   heard tokens using Levenshtein over normalized words (no accents, canonical
   numbers). Script words inherit the heard timings; a name that Mistral splits
   keeps the full span; unmatched words are interpolated between neighbors.
3. `video-render/cli/render.mjs` logs `guion: NN% de coincidencia` and uses the
   aligned text only if `NN >= 50`. Below that it falls back to Mistral's raw
   words: a wrong reference is worse than an approximate transcription.
4. `words` reaches the composition already offset by the 0.5 s intro. The plan
   code must not add another offset.

Never edit timings by hand. Fix the reference text.

### Reasoned reference correction

Pass `--script` whenever the audio has a script. If you know the number, add
`--script-n`; if not, omit it and the CLI aligns the transcription against every
script and picks the best match. Always read the `guion:` line, which reports the
chosen number and percentage.

- **Score ≥ 50%**: the alignment is reliable. Do not rewrite the narration to
  "improve" it; fix only a concrete factual error that would be visible on screen
  (a player who did not play, a false scoreline) and render again.
- **Score < 50%**: the recording does not follow the master script (improvised
  take, wrong number, edited narration) and the render uses the raw text. Read the
  full transcription, compare it with the script and write a corrected reference
  that says what the audio actually says, with fixed names and figures. Render
  again.
- **Ambiguous case** (score just below 50%, or one wrong name inside a good
  alignment): fix only the affected words and re-render.

The corrected file has the shape `--script` expects:

```json
{ "scripts": [{ "n": 1, "narration": "…" }] }
```

Save it to `video-render/work/<id>/<slug>/reference.json` and pass
`--script="video-render/work/<id>/<slug>/reference.json" --script-n=1`.

## Step 1 — Choose the match

```sh
node scripts/list-media-packs.mjs
```

It reads the current `public/data/top.json`, keeps the matches that already have a
media pack or a progress file and prints a numbered Markdown table sorted by
kickoff (UTC), with match, date, photos, clips, status, script, audio and `id`.
Status is `completo`, `parcial` or `sin media`; a partial pack is usable and its
counts are the real media level. It excludes matches whose kickoff already
passed, so the table is always upcoming matches. Paste that table in full before
asking anything: do not summarize it, do not reorder it from memory and do not
start from an audio first. Then ask for an `id`.

Use the exact `id`: it is the key for both the media pack and the render command.
Prefer matches with 4 images and 4 clips; if the chosen one has fewer, use it and
make the most of what is available. Never use a pack with 0 images and 0 clips:
a `sin media` row needs media generation first. `--all` includes packs outside
the current top.

When presenting the scripts for the chosen match, include its media level
(photos/clips, status, script availability) and the action needed to complete it.
Missing or partial media is completed through GitHub Actions, the only supported
producer:

```sh
gh workflow run 2-scripting.yml -f match=<id>        # only when Guion is "no"
gh workflow run 3-media-creation.yml -f match=<id>   # generates, uploads to R2, updates state
```

A finished partial bank is published with `bankStatus: partial` and is renderable;
the scheduler still treats it as pending and keeps generating the missing clips.

If the audios are numbered, the `audio` column will be empty; that is normal. They
are identified in step 2.

Closure criterion: the user chose an `id`.

## Step 2 — Prepare the audio

### 2.1 Create the folder and wait

Run this immediately after the user picks the match:

```sh
node video-render/cli/audio.mjs prepare <id>
```

It creates `video-render/audios/<id>/` and prints the path followed by every
published script of the match. Paste the path and the full script block in the
chat; do not summarize or drop scripts. Then tell the user:

> Deja la grabación en `video-render/audios/<id>/` y avísame cuando esté.

Stop there. Do not read the media pack, write the plan or render until the user
confirms the audio is in place. When they confirm, run:

```sh
node video-render/cli/audio.mjs check <id>
```

It exits non-zero when the folder has no audio, or when it has several and no
`--audio` was given. Only continue if it prints `audio: listo:`.

### 2.2 Identify the recording

When a batch arrives, inventory the recordings and assign each file to an `id`
before rendering anything. `--audio` only chooses among files and must point
inside `audios/<id>/` (or `audios/tests/` for a fixture).

If the files are numbered (for example `Track-78.m4a`), do not trust the name:
identify the match from the first seconds of voice. This helper prints the Mistral
transcription; use `-t 20` to identify and remove it for the full transcription of
a correction.

```sh
TMP="video-render/work/<id>/<slug>"
mkdir -p "$TMP"
ffmpeg -y -loglevel error -t 20 -i "$AUDIO" -ac 1 -ar 16000 "$TMP/identify.flac"
VOICE_FLAC="$TMP/identify.flac" node --env-file=.env --input-type=module -e "
const { mistral } = await import('./video-render/pipeline/02-transcribe.mjs');
const words = await mistral({ flac: process.env.VOICE_FLAC, env: process.env, fetchImpl: fetch });
console.log(words.map(w => w.word).join(' '));
"
```

If several candidates fit, ask. If there is no audio, ask the user to leave it in
the folder.

Measure the duration:

```sh
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$AUDIO"
```

Voice policy:

- up to 53 s: used as is;
- 53 to 58.3 s: sped up with `atempo`, preserving pitch, at most 1.1×;
- more than 58.3 s: fails with `VOICE_TOO_LONG`. Offer to trim, split or re-record.
  Never edit the original; the render works on a temporary copy.

Closure criterion: the user confirmed the audio, one audio path is known, its
duration is measured and there is a decision if it exceeds the limit.

## Step 3 — Read the media pack

Read `public/data/media-pack/<id>.json`. It contains:

- `assets`: up to 4 Agnes images.
- `clips`: match clips, about 6.5 s at 720×1280.
- `facts`: real match figures.
- `match`, `home`, `away`.
- `bankStatus`: `complete` or `partial`. A partial pack is usable; work with the
  assets and clips it has and note the limitation. A partial pack with 0 assets
  and 0 clips is not renderable.

Download the clips and extract one frame from each to see what they show before
writing the plan. Use `clips[].url` and
`ffmpeg -ss 1 -i clip.mp4 -frames:v 1`. Look at the frames with the image reading
tool. If a clip is corrupt or empty, note it and use the rest. Every **usable**
clip must appear at least once.

Closure criterion: you know what each clip shows and how many you will use.

## Step 4 — Write the plan

Create `video-render/work/<id>/<slug>/plan.json`:

```json
{
  "version": 5,
  "visualStyle": "editorial",
  "music": true,
  "scenes": [{ "start": 0, "end": 4.5 }],
  "code": "import React from 'react'; ..."
}
```

- `visualStyle`: `editorial`, `documentary` or `trailer`.
- `music` must be `true`.
- `scenes` are absolute seconds for sampling the visual review. They must end
  inside the content, which runs from 0 to `voiceSeconds / rate + 1` (the 1 s
  endcard is outside). If you do not know the rate, `voiceSeconds / 1.1 + 1` is
  always safe. They do not impose structure.
- `code` is a JSX module, maximum 200 KB.

### Code contract

- Default-export a React component.
- It receives `frames`, `contentFrames`, `photos`, `clips`, `words`, `facts`,
  `match`, `brandName`, `brandUrl`, `font`, `brand`.
- `photos`: `{src, backdrop, focusBlur, width, height}`.
- `clips`: `{src, width, height, duration}`.
- `words`: `{word, start, end}` in seconds, already on the final timeline.
- The engine mounts the component for `contentFrames` and adds the 1 s endcard
  with the logo. Do not draw the endcard.
- Allowed imports: `react`; from `remotion` only `AbsoluteFill`, `Sequence`,
  `Series`, `Freeze`, `Loop`, `Img`, `OffthreadVideo`, `Html5Video`, `Video`,
  `useCurrentFrame`, `useVideoConfig`, `interpolate`, `interpolateColors`,
  `spring`, `Easing`, `random`, `getInputProps`; from `goatlab-kit` only `Captions`,
  `FitText`, `SafeArea`, `KenBurns`, `StatCard`, `CameraMove`, `ColorWash`,
  `FilmGrain`, `phrases`, `wordAt`, `fitFontSize`.
- Use `Img` for photos and `Video`/`OffthreadVideo` for clips. Paths come from
  props; never invent URLs or load external resources.
- Animate with `useCurrentFrame` plus `interpolate`/`spring`. No `setTimeout`,
  `setInterval`, `window`, `document`, `fetch` or dynamic imports.
- The local font is `GoatLabLocal`; use `fontFamily: 'GoatLabLocal, sans-serif'`.
- Respect the safe area: 160 px top, 340 px bottom, 60 px left, 160 px right.
  Text must be readable from 40 px.
- Subtitles: use `Captions` with `words`; fill `#ffe14a` and black outline. You may
  change size, position and animation, but keep the brand fill and outline and make
  them readable on a phone.

### Visual direction

Permanent user preferences, not suggestions:

- **Vivid color.** Keep saturation high and the brand green alive. Use veils and
  gradients as accents, not as a global tint.
- **Brightness and light.** Lift the shadows and keep the midtones open. No
  underexposed sequences, long black passages, crushed blacks or heavy vignettes.
- **Sharp image.** Crop from the native resolution and avoid upscaling beyond the
  source. Blur belongs to backgrounds, transitions and graphic layers, never to the
  subject; use `backdrop` and `focusBlur` to separate.
- **Readability without darkening.** Subtitles use the brand fill and black
  outline. Do not darken the whole frame or add heavy shadows to make the text
  readable.
- **Dark green `#101412` belongs to the endcard.** Do not let it dominate the
  content.

Variety still matters: these rules limit quality, not concept.

### Local creative freedom

There is no Fly CPU budget. You may use:

- two or three clips at once, picture-in-picture, split screens;
- masks, `clip-path`, `mix-blend-mode`, gradients, light leaks;
- `filter: blur` and `backdrop-filter` on backgrounds and graphic layers, grain,
  chromatic aberration, scanlines;
- SVG with `feTurbulence`, `feGaussianBlur`, `feDisplacementMap`;
- 3D transforms, parallax, particles, kinetic typography, counters;
- cuts on the voice, transitions and reframing.

Measure the first render: if the local budget runs out, raise `CAPTURE_BUDGET_MS`
or simplify only the most expensive scene. Do not fall back to Fly's flat style
out of caution.

### Clips and facts

- Every usable clip appears at least once. If the audio is shorter than the sum of
  clips, trim with `startFrom`/`endAt`; if it is longer, reuse with `Loop` or
  `Freeze`.
- Use 2 to 4 figures from `facts`; never invent statistics.
- Agnes images support the piece; clips lead when they exist.
- Vary the concept between audios: never repeat the same template with only the
  text changed.

Closure criterion: the JSON parses, the code has a default export, `music` is
`true`, every usable clip appears and `scenes` fits inside the content.

## Step 5 — Render

```sh
CAPTURE_BUDGET_MS=3600000 CAPTURE_TIMEOUT_MS=3600000 RENDER_WORKERS=4 \
LAYOUT_CHECK=advisory RENDER_CRF=23 \
node --env-file=.env video-render/cli/render.mjs \
  --match=<id> \
  --script="public/data/youtube-scripts/<id>.json" \
  --script-n=<n> \
  --plan="video-render/work/<id>/<slug>/plan.json" \
  --variant=1 \
  --keep
```

- Audio defaults to the only file in `video-render/audios/<id>/`; add
  `--audio=` only when the folder holds more than one recording.
- Output defaults to `video-render/videos/<id>/<title>.mp4`, using the resolved
  script title with its icons. Characters filesystems reject (`:`, `?`, `/`,
  quotes) become spaces or a dash. Without `--script`, the fallback is
  `<id>-<audio>-v1.mp4`. Pass `--out` to name the file explicitly.

- `CAPTURE_BUDGET_MS=3600000` allows one hour of capture for advanced effects.
  `CAPTURE_TIMEOUT_MS` must match: the default is 20 minutes and would cancel a
  heavy render even if the budget is higher.
- `RENDER_WORKERS=4` uses four cores; raise or lower it for the machine.
- `LAYOUT_CHECK=advisory` warns about text outside the safe area without blocking.
- `RENDER_CRF=23` keeps most files under 45 MB.
- `--script` is optional: with it, subtitles use the script text and Mistral's
  timings. `--script-n` fixes the script; without it the best match is chosen.
  Without `--script`, the raw transcription is used.
- `--keep` saves `<title>.composition.json` in `video-render/work/<id>/`.
- Each render appends an entry to `manifest.json` in the output folder.
- Run with a long timeout (30 to 60 min).
- `--variant` names the temporary directory `goatlab-short-<match>-v<variant>`.
  Never reuse a variant while another render is running.

| Failure | Fix |
| --- | --- |
| `VOICE_TOO_LONG` | audio longer than 58.3 s: trim, split or re-record |
| `guion:` below 50 | write a corrected reference and re-render |
| `compilación` / `compilación JSX` | fix imports or JSX |
| `presupuesto de captura` | raise `CAPTURE_BUDGET_MS` or simplify the most expensive scene |
| `falta la música de fondo` | restore `video-render/soundtracks/bed.mp3` |
| `MP4 fuera del contrato` | check duration, format or size; re-encode if needed |

If an MP4 reaches 45 MB, re-encode only that file:

```sh
ffmpeg -y -i input.mp4 -c:v libx264 -preset medium \
  -b:v 7.2M -maxrate 8M -bufsize 16M -pix_fmt yuv420p \
  -c:a copy -movflags +faststart output.mp4
```

Closure criterion: the MP4 exists and `ffprobe` confirms 1080×1920, 30 fps, H.264,
AAC, ≤55 s and <45 MB.

## Step 6 — Review before delivery

Check the technical contract first:

```sh
ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate \
  -show_entries format=duration,size -of default=nw=1 "$OUT"
```

Then sample the timeline into a QA folder:

```sh
QA="video-render/work/<id>/<slug>/qa"
mkdir -p "$QA"
D=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT")
for pct in 5 25 50 75 95; do
  t=$(node -e "console.log(($D*$pct/100).toFixed(2))")
  ffmpeg -y -loglevel error -ss "$t" -i "$OUT" -frames:v 1 "$QA/f$pct.jpg"
done
END=$(node -e "console.log(($D-0.5).toFixed(2))")
ffmpeg -y -loglevel error -ss "$END" -i "$OUT" -frames:v 1 "$QA/endcard.jpg"
```

Look at the frames and check:

- subtitles readable, uncropped and inside the safe area;
- bright, sharp and vivid image, with no dark or murky passages;
- recognizable clips and every usable clip present;
- the endcard shows the logo for 1 s;
- no black frames or broken resources.

Detect unintentional black segments (the endcard is dark on purpose, so it is
excluded):

```sh
D=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT")
CONTENT=$(node -e "console.log(($D-1).toFixed(2))")
ffmpeg -hide_banner -t "$CONTENT" -i "$OUT" -vf blackdetect=d=0.5:pix_th=0.10 \
  -an -f null - 2>&1 | grep blackdetect
```

No output means no black segment. If something is wrong, edit the plan and render
`-v2`; never deliver a broken file. Closure criterion: you reviewed at least 5
frames plus the endcard, the technical probe matches and the `guion:` score was
acceptable or you used the corrected reference.

## Step 7 — Deliver

Run `pnpm video:layout`; it must print `video-render layout: ok`. The CLI already
rejects audio or output outside the contracted folders.

Leave the MP4 in `video-render/videos/<id>/`. Do not delete the original audio or the
plan. Reply with:

- the file path;
- one sentence about the concept (style, clips used, effects);
- any limitation (missing clip, sped-up audio, alignment fallback, and so on).

For several audios, keep one output per audio in `video-render/videos/<id>/` and
verify and deliver each one separately; one failure must not block the rest.

## Several videos in parallel

The temporary directory is `$TMPDIR/goatlab-short-<match>-v<variant>` and is
deleted at the start of each run. Two processes with the same match and variant
destroy each other. Give each concurrent render its own identity:

| Resource | Rule |
| --- | --- |
| Temp dir | Unique `--variant` per process. |
| Plan and QA | `video-render/work/<id>/<slug>/…`, one slug per audio. |
| Output | `video-render/videos/<id>/<title>.mp4` (fallback `<id>-<audio>-v<n>.mp4`); pass `--out` when two processes would share a title; `--keep` writes the composition to `video-render/work/<id>/`. |
| Media cache | Different matches: the shared cache is safe (keys by URL hash). Same match: `PHOTO_CACHE_DIR="video-render/work/<id>/<slug>/photos"` for a private cache. |
| CPU | 2 to 3 concurrent renders with `RENDER_WORKERS=3` each. Never launch ten. |

## References

- `video-render/STYLE.md`: permanent preferences and lessons from real renders.
- `references/creative.md`: creative contract, imports and kit.
- `references/brand.md`: brand, colors, subtitles and music.
- `references/remotion.md`: Remotion authoring guide, patterns and common errors.
