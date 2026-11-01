---
name: video-opencode
description: >-
  Render a GoatLab Short locally in opencode from a voice track and a match
  media pack. Pick the match, transcribe the voice, author an original Remotion
  composition with every usable clip and advanced effects, review the result,
  and deliver the MP4 to the Desktop. Use when the user asks for a local video.
disable-model-invocation: true
---

# GoatLab local video

This skill does in opencode what `goatlab-render` does on Fly.io, without the
worker's CPU budget. It uses the same Remotion engine, the same transcription
and the same delivery contract. The difference is creative: locally you can use
every clip in the match and effects that Fly had to limit.

## Delivery contract

- 1080×1920, 30 fps, H.264 with AAC audio.
- 55 s maximum: 0.5 s lead-in + voice + 0.5 s tail + 1 s GoatLab logo endcard.
- Spanish captions, legible, synced to `words`.
- Background music is mandatory: `plan.music: true`.
- One video per audio.
- Audio in: `~/Desktop/goatlab-audios/`.
- Deliveries: `~/Desktop/goatlab-renders/`.
- The only fixed brand element is the closing logo; everything else is yours.
- Standing visual preference: vivid color, sharp and well-lit image, no dark or
  murky passages. Step 4 turns this into concrete rules.

## How subtitle timing works

The pipeline mirrors Fly.io: the narration in the YouTube script is the master
text, Mistral supplies the clock.

1. `fly/render/transcribe.mjs` sends a 16 kHz mono FLAC to Mistral (Voxtral) with
   `timestamp_granularities=word`, so every heard token gets a start and an end.
   If Mistral fails, times out (45 s) or hears nothing, whisper.cpp runs locally.
2. `fly/render/reference-timing.mjs` aligns script tokens against heard tokens
   with a Levenshtein pass over normalized words (accents stripped, number words
   canonicalized). Matched script words inherit the heard times; a name Mistral
   splits keeps the whole span; unmatched script words are interpolated between
   their neighbours.
3. `scripts/render-short.mjs` logs `guion: NN% de coincidencia` and uses the
   aligned script text only when `NN >= 50`. Below that it falls back to the raw
   Mistral words: a wrong reference is worse than a rough transcript.
4. `words` reaches the composition already shifted by the 0.5 s lead-in, so
   caption code must not add an offset.

Never hand-edit word timings. Correct the reference text instead.

### When the reference needs a reasoned correction

Pass `--script` and `--script-n` whenever the audio has a script, then read the
`guion:` line.

- **Score ≥ 50%**: the alignment is reliable. Keep it. Do not rewrite the
  narration to "improve" it; only fix a concrete factual error that would appear
  on screen (a player who did not play, a wrong score), then re-render.
- **Score < 50%**: the recording does not follow the master script (improvised
  take, wrong script number, edited narration) and the renderer is showing raw
  Mistral text. Read the full transcript, compare it with the script, and write
  a corrected reference that says what the audio actually says, with names and
  numbers fixed. Re-render with it.
- **Ambiguous case** (score just below 50%, or one wrong name inside a good
  alignment): correct only the affected words and re-render. Leave the rest of
  the script untouched.

The corrected file has the shape `--script` expects:

```json
{ "scripts": [{ "n": 1, "narration": "…" }] }
```

Save it as `.cache/video-opencode/<id>/<slug>/reference.json` and pass
`--script=".cache/video-opencode/<id>/<slug>/reference.json" --script-n=1`.
`<slug>` is a short kebab-case label for the audio, for example `script-3` or
the file stem.

## Step 1 — Pick the match

Run:

```sh
node scripts/list-media-packs.mjs
```

Show the table to the user and ask for an `id`. Use the exact `id`: it is the key
for both the media pack and the render command. Prefer matches with 4 images and
4 clips; if the chosen one has fewer, use it anyway and make the most of what is
available. Never use a pack with 0 images and 0 clips.

If the audios are numbered, the `audio` column will be empty for every row; that
is expected. Identify them in Step 2.

Closing criterion: the user chose an `id` and an audio exists for that match.

## Step 2 — Prepare the audio

Look for a file in `~/Desktop/goatlab-audios/` whose name starts with the chosen
`id`. When a batch arrives, inventory the whole folder and map every file to an
`id` before rendering anything.

If the files are numbered (for example `Track-78.m4a`), do not trust the name:
identify the match from the first seconds of speech. This helper prints the
Mistral transcript; keep `-t 20` for identification and drop it for the full
transcript needed by a correction.

```sh
TMP=".cache/video-opencode/<id>/<slug>"
mkdir -p "$TMP"
ffmpeg -y -loglevel error -t 20 -i "$AUDIO" -ac 1 -ar 16000 "$TMP/identify.flac"
VOICE_FLAC="$TMP/identify.flac" node --env-file=.env --input-type=module -e "
const { mistral } = await import('./fly/render/transcribe.mjs');
const words = await mistral({ flac: process.env.VOICE_FLAC, env: process.env, fetchImpl: fetch });
console.log(words.map(w => w.word).join(' '));
"
```

If several candidates fit, ask. If there is no audio, ask the user to drop it in.

Measure the duration:

```sh
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$AUDIO"
```

Voice policy:

- up to 53 s: used as recorded;
- 53–58.3 s: sped up with `atempo`, pitch preserved, at most 1.1×;
- over 58.3 s: fails with `VOICE_TOO_LONG`. Offer to trim, split or re-record.
  Never edit the original; the render works on a temporary copy.

Closing criterion: one audio path, a known duration and a decision if it exceeds
the limit.

## Step 3 — Read the media pack

Read `public/data/media-pack/<id>.json`. It contains:

- `assets`: up to 4 Agnes images.
- `clips`: match clips, each about 6.5 s at 720×1280.
- `facts`: real match numbers.
- `match`, `home`, `away`.

Download the clips and extract one frame from each to see what they show before
writing the plan. Use `clips[].url` and
`ffmpeg -ss 1 -i clip.mp4 -frames:v 1`. Look at the frames with Read. If a clip
is corrupt or empty, note it and use the rest. Every **usable** clip must appear
at least once.

Closing criterion: you know what each clip shows and how many you will use.

## Step 4 — Write the plan

Create `.cache/video-opencode/<id>/<slug>/plan.json`:

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
- `scenes` are absolute seconds used to sample the visual review. They must end
  inside the content timeline, which runs from 0 to `voiceSeconds / rate + 1`
  (the 1 s endcard is outside it). When the rate is unknown,
  `voiceSeconds / 1.1 + 1` is always safe. They do not impose structure.
- `code` is a JSX module, at most 200 KB.

### Code contract

- Default-export a React component.
- It receives `frames`, `contentFrames`, `photos`, `clips`, `words`, `facts`,
  `match`, `brandName`, `brandUrl`, `font`, `brand`.
- `photos`: `{src, backdrop, focusBlur, width, height}`.
- `clips`: `{src, width, height, duration}`.
- `words`: `{word, start, end}` in seconds, already on the final timeline.
- The engine mounts the component for `contentFrames` and appends the 1 s logo
  endcard. Do not draw the endcard yourself.
- Allowed imports: `react`; from `remotion` only `AbsoluteFill`, `Sequence`,
  `Series`, `Freeze`, `Loop`, `Img`, `OffthreadVideo`, `Html5Video`, `Video`,
  `useCurrentFrame`, `useVideoConfig`, `interpolate`, `interpolateColors`,
  `spring`, `Easing`, `random`, `getInputProps`; from `goatlab-kit` only
  `Captions`, `FitText`, `SafeArea`, `KenBurns`, `StatCard`, `CameraMove`,
  `ColorWash`, `FilmGrain`, `phrases`, `wordAt`, `fitFontSize`.
- Use `Img` for photos and `Video`/`OffthreadVideo` for clips. Paths come from
  the props; never invent URLs or load external resources.
- Animate with `useCurrentFrame` plus `interpolate`/`spring`. No `setTimeout`,
  `setInterval`, `window`, `document`, `fetch` or dynamic imports.
- The local font is `GoatLabLocal`; use
  `fontFamily: 'GoatLabLocal, sans-serif'`.
- Respect the safe area: 160 px top, 340 px bottom, 60 px left, 160 px right.
  Text must read from 40 px.
- Captions: use `Captions` with `words`; fill `#ffe14a` and a black outline. You
  may change size, position and animation, but keep the brand fill and outline
  and make them readable on a phone.

### Visual direction

These are standing user preferences, not suggestions:

- **Vivid color.** Keep saturation high and the pitch green alive. Use color
  washes and gradients as accents, not as a blanket tint.
- **Bright and well lit.** Lift shadows and keep midtones open. No underexposed
  sequences, no long black passages, no crushed blacks or heavy vignettes.
- **Sharp image.** Crop from native resolution and avoid upscaling past the
  source. Blur belongs to backgrounds, transitions and graphic layers, never to
  the subject; use `backdrop` and `focusBlur` for separation.
- **Legibility without darkness.** Captions use the brand fill and a black
  outline. Do not darken the whole frame or add heavy drop shadows to make text
  readable.
- **The dark brand green `#101412` belongs to the endcard.** Do not let it
  dominate the content.

Variety still matters: these rules constrain quality, not the concept.

### Local creative freedom

On Fly the CPU budget banned `filter: blur`, `backdrop-filter`, large shadows,
many layers and simultaneous videos. **That limit does not apply here.** You can
use:

- two or three clips at once, picture-in-picture, split screens;
- masks, `clip-path`, `mix-blend-mode`, gradients, light leaks;
- `filter: blur` and `backdrop-filter` on backgrounds and graphic layers, grain,
  chromatic aberration, scanlines;
- SVG with `feTurbulence`, `feGaussianBlur`, `feDisplacementMap`;
- 3D transforms, parallax, particles, kinetic typography, counters;
- cuts on the voice, transitions and reframes.

Measure the first render: if the local budget runs out, raise
`CAPTURE_BUDGET_MS` or simplify only the most expensive scene. Do not fall back
to Fly's flat aesthetic out of caution.

### Clips and facts

- Every usable clip appears at least once. If the audio is shorter than the sum
  of clips, trim with `startFrom`/`endAt`; if it is longer, reuse with `Loop` or
  `Freeze`.
- Use 2–4 numbers from `facts`; never invent statistics.
- Agnes images support the piece; clips lead when they exist.
- Vary the concept between audios: never repeat the same template with different
  text.

Closing criterion: the JSON parses, the code has a default export, `music` is
`true`, every usable clip appears and `scenes` fit inside the content.

## Step 5 — Render

```sh
CAPTURE_BUDGET_MS=3600000 CAPTURE_TIMEOUT_MS=3600000 RENDER_WORKERS=4 \
LAYOUT_CHECK=advisory RENDER_CRF=23 \
node --env-file=.env scripts/render-short.mjs \
  --match=<id> \
  --audio="$HOME/Desktop/goatlab-audios/<file>" \
  --script="public/data/youtube-scripts/<id>.json" \
  --script-n=<n> \
  --plan=".cache/video-opencode/<id>/<slug>/plan.json" \
  --out="$HOME/Desktop/goatlab-renders/<id>-<slug>-v1.mp4" \
  --variant=1 \
  --keep
```

- `CAPTURE_BUDGET_MS=3600000` allows an hour of capture for advanced effects.
  `CAPTURE_TIMEOUT_MS` must match: the default is 20 minutes and would cancel a
  heavy render regardless of the budget.
- `RENDER_WORKERS=4` uses four cores; raise or lower it as needed.
- `LAYOUT_CHECK=advisory` reports text outside the safe area without blocking.
- `RENDER_CRF=23` keeps most files under 45 MB.
- `--script` and `--script-n` are optional: with them, captions use the script
  text and Mistral times; without them, the raw transcription is used.
- `--keep` saves `composition.json` next to the MP4.
- Run with a long timeout (30–60 min). The first render downloads Chrome and
  media.
- `--variant` names the temp directory `goatlab-short-<match>-v<variant>`.
  Never reuse a variant while another render is running.

| Failure | Fix |
| --- | --- |
| `VOICE_TOO_LONG` | audio over 58.3 s: trim, split or re-record |
| `guion:` score below 50 | write a corrected reference and re-render |
| `compilación` / `compilación JSX` | fix the imports or JSX |
| `presupuesto de captura` | raise `CAPTURE_BUDGET_MS` or simplify the costliest scene |
| `falta la música de fondo` | restore `fly/render/assets/bed.mp3` |
| `MP4 fuera del contrato` | check duration, format or size; re-encode if needed |

If an MP4 reaches 45 MB, re-encode only that file:

```sh
ffmpeg -y -i input.mp4 -c:v libx264 -preset medium \
  -b:v 7.2M -maxrate 8M -bufsize 16M -pix_fmt yuv420p \
  -c:a copy -movflags +faststart output.mp4
```

Closing criterion: the MP4 exists and `ffprobe` confirms 1080×1920, 30 fps,
H.264, AAC, ≤55 s and <45 MB.

## Step 6 — Review before delivery

Check the technical contract first:

```sh
ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate \
  -show_entries format=duration,size -of default=nw=1 "$OUT"
```

Then sample the timeline into a per-audio QA folder:

```sh
QA=".cache/video-opencode/<id>/<slug>/qa"
mkdir -p "$QA"
D=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT")
for pct in 5 25 50 75 95; do
  t=$(node -e "console.log(($D*$pct/100).toFixed(2))")
  ffmpeg -y -loglevel error -ss "$t" -i "$OUT" -frames:v 1 "$QA/f$pct.jpg"
done
END=$(node -e "console.log(($D-0.5).toFixed(2))")
ffmpeg -y -loglevel error -ss "$END" -i "$OUT" -frames:v 1 "$QA/endcard.jpg"
```

Look at the frames with Read and check:

- captions readable, not clipped and inside the safe area;
- image bright, sharp and vivid, with no dark or muddy passage;
- clips recognizable and every usable clip present;
- the endcard shows the logo for 1 s;
- no black frames or broken resources.

Detect unintended black segments in the content (the endcard is dark on
purpose, so it is excluded):

```sh
D=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT")
CONTENT=$(node -e "console.log(($D-1).toFixed(2))")
ffmpeg -hide_banner -t "$CONTENT" -i "$OUT" -vf blackdetect=d=0.5:pix_th=0.10 \
  -an -f null - 2>&1 | grep blackdetect
```

No output means no black segment. If something is wrong, edit the plan and
render `-v2`; never deliver a broken file. Closing criterion: you reviewed at
least 5 frames plus the endcard, the technical probe matches the contract and
the `guion:` score was acceptable or the corrected reference was used.

## Step 7 — Deliver

Leave the MP4 in `~/Desktop/goatlab-renders/`. Do not delete the original audio
or the plan. Reply with:

- the file path;
- one sentence about the concept (style, clips used, effects);
- any limitation (missing clip, accelerated audio, alignment fallback, etc.).

For several audios, name each output `<id>-<slug>-v1.mp4` and verify and deliver
them independently; one failure must not block the rest.

## Running several videos in parallel

The renderer's temp directory is `$TMPDIR/goatlab-short-<match>-v<variant>` and
it is wiped at the start of every run. Two processes with the same match and
variant will destroy each other's work. Give every concurrent render its own
identity:

| Resource | Rule |
| --- | --- |
| Temp dir | Unique `--variant` per process. |
| Plan and QA | `.cache/video-opencode/<id>/<slug>/…`, one slug per audio. |
| Output | `<id>-<slug>-v1.mp4`; `--keep` writes the JSON beside it. |
| Media cache | Different matches: the shared cache is safe (keys are URL hashes). Same match: set `PHOTO_CACHE_DIR=".cache/video-opencode/<id>/<slug>/photos"` so each process gets a private photo and clip cache. |
| CPU | 2–3 concurrent renders with `RENDER_WORKERS=3` each. Never launch ten. |

## References

- Original creative contract: `fly/gateway/workspace/skills/goatlab/references/creative.md`.
  Ignore its Fly capture-cost section; the rest of the interface still applies.
- Brand: `fly/gateway/workspace/skills/goatlab/references/brand.md`. Its 3 s
  endcard with domain is the legacy Fly closing; locally the engine appends a
  1 s logo only.
- Kit: `fly/render/kit/goatlab-kit.jsx`.
- Local render: `scripts/render-short.mjs` and `fly/render/short-job.mjs`.
- Script/Mistral alignment: `fly/render/reference-timing.mjs`.
