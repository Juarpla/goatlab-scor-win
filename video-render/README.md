# video-render

Local GoatLab Shorts renderer. It takes an audio track, a media pack and a JSX
plan, and delivers a 1080×1920 MP4 with voice, music and subtitles. There is no
remote worker and no Fly.io: everything runs on this machine.

## Authoring sources

- [Workflow](../.agents/skills/video-render/SKILL.md): audio, preparation, render,
  review and delivery.
- [Creative direction](../.agents/skills/video-render/references/creative.md): the
  single source for final-video aesthetic decisions.
- [Fixed identity](../.agents/skills/video-render/references/brand.md): brand assets.
- [Technical authoring](../.agents/skills/video-render/references/remotion.md): plan
  schema, JSX, runtime, kit and timing.
- [Compliance](../COMPLIANCE.md): editorial and provenance constraints.

Generation prompts govern source images and animation, while the
[writing skill](../.agents/skills/writing-short-scripts/SKILL.md) governs spoken
scripts. They do not prescribe the final montage. October reports about remote
workers are historical; they do not override these sources. See the
[consolidation audit](CREATIVE-AUDIT.md) for the conflicts resolved on 2026-11-05.

## Structure

```
video-render/
  contract/                  shared constants, plan/timing rules, folder layout
  pipeline/                  numbered stages in execution order
    00-io.mjs                ffprobe duration and atomic JSON writes
    01-voice.mjs             speed-up policy for the voice
    02-transcribe.mjs        Mistral (Voxtral) with whisper.cpp fallback
    03-reference-timing.mjs  script/word alignment
    04-photo-normalize.mjs   image sizing
    05-photo-cache.mjs       photo download and cache
    06-clip-cache.mjs        clip download and cache
    07-prepare.mjs           immutable prepared.json
    08-author.mjs            plan -> renderer props
    09-render.mjs            renderer capture
    10-mux.mjs               voice + bed mix
  render/                    pluggable renderers
    index.mjs                registry and interface
    remotion/                Remotion implementation
      compositions/          React compositions
      kit/                   design kit
      assets/                font and brand
  cli/render.mjs             terminal entry point
  cli/audio.mjs              audio folder gate: prepare + check
  cli/check-layout.mjs       media folder validator
  bench/render-input.mjs     benchmark-only copy helper
  soundtracks/bed.mp3        background music (independent of the renderer)
  audios/<match-id>/         voice recordings (ignored by git)
  audios/tests/              three versioned audio fixtures
  videos/<match-id>/         delivered MP4s (ignored by git)
  videos/tests/              test renders (contents ignored; .gitkeep keeps the folder)
  work/<match-id>/           plans, manifests and QA (contents ignored; work/.gitkeep keeps the folder)
  STYLE.md                   compatibility link to creative direction
```

## Folder contract

`contract/layout.js` is the single source of truth for the media tree. The CLI
builds every path through it, rejects audio outside `audios/<match-id>/` (or the
fixtures folder) and rejects outputs outside `videos/<match-id>/` (or
`videos/tests/`). Check the tree with:

```sh
pnpm video:layout
```

- `audios/<match-id>/` holds the voice recordings for that match. `tests` is a
  reserved match id: `audios/tests/` holds the three versioned fixtures.
- `videos/<match-id>/` holds only MP4s. Recipes never live there.
- `videos/tests/` holds renders that are not delivered to the user. Git tracks
  the folder through `.gitkeep`; its contents are ignored.
- `work/<match-id>/` holds `manifest.json`, `<video>.plan.json`,
  `<video>.composition.json` and local QA. Git tracks `work/` through
  `.gitkeep`; everything inside is ignored, and only match folders (plus the
  `.gitkeep` placeholder) are allowed at its root.

## CLI and bench

- `cli/render.mjs` is the production entry point. It parses arguments, resolves
  the media pack and folders, runs the pipeline and validates the MP4.
- `cli/audio.mjs` creates `audios/<match-id>/` before the recording exists,
  prints the published YouTube scripts and validates that exactly one audio is
  available before a render.
- `cli/check-layout.mjs` walks the media tree and exits non-zero on any file
  that breaks the contract.
- `bench/render-input.mjs` copies a composition into an isolated directory so
  the benchmark scripts can time repeated renders without touching the original.
  It is not part of the production path.

## Renderer interface

`render/index.mjs` exposes `getRenderer(name)`. `VIDEO_RENDERER` selects the
implementation (default `remotion`). A renderer is a module exporting:

| Export | Contract |
| --- | --- |
| `name` | matches its key in the registry |
| `props(prepared, plan)` | validates the plan and returns `composition.json` |
| `materialize(tmp)` | copies the renderer's own assets into the job folder |
| `render(tmp, out, opts)` | writes the silent MP4 and returns metrics |

`pipeline/` imports only `render/index.mjs`, never `render/<technology>`. To add
a technology, create `render/<name>/index.mjs`, register it in
`render/index.mjs`, and set `VIDEO_RENDERER=<name>`.

## Updating Remotion

Remotion packages are pinned together in `render/remotion/package.json`. The
upgrade path is one command:

```sh
npm --prefix video-render/render/remotion run upgrade
```

`upgrade` installs the latest `remotion` and every `@remotion/*` package at the
same version and refreshes `package-lock.json`. Keep them in lockstep: Remotion
requires matching versions across its packages. React 19 is the peer version
used here. To verify the new version still bundles:

```sh
node video-render/render/remotion/remotion-build.mjs
```

## Requirements

Node 22.12 or later, ffmpeg and ffprobe. Render dependencies:

```sh
npm ci --prefix video-render/render/remotion
```

Transcription uses `MISTRAL_API_KEY` from `.env` (never in git), with a local
whisper.cpp fallback. The render has no creative-model API dependency. R2/Agnes
credentials belong to the separate GitHub Actions media-generation flow.

## Usage

Create the match folder before the recording exists; the command prints the
published scripts and then waits for the user:

```sh
node video-render/cli/audio.mjs prepare <match-id>
# the user drops the recording in video-render/audios/<match-id>/
node video-render/cli/audio.mjs check <match-id>
```

`prepare` creates `audios/<match-id>/` and prints every script in
`public/data/youtube-scripts/<match-id>.json`; paste that block in the chat so the
recording follows one narration. `check` exits non-zero when the folder has no
audio, or when it has several and no `--audio` was given. The render CLI then
uses the only audio it finds.

```sh
node --env-file=.env video-render/cli/render.mjs \
  --match=real-racing-club-vs-real-madrid-2026-11-01 \
  --script=public/data/youtube-scripts/real-racing-club-vs-real-madrid-2026-11-01.json \
  --script-n=6 \
  --plan=video-render/work/<id>/<slug>/plan.json \
  --variant=1 --keep
```

- `--audio` is optional; pass it only when the match folder has more than one
  file. It must already live in `audios/<id>/` or `audios/tests/`.
- `--script` is optional; with it, subtitles use the script text and Mistral's
  timings. `--script-n` fixes the script; without it, the CLI picks the best match
  against every script in the file.
- Without `--out`, the MP4 takes its name from the resolved script title, icons
  included: `video-render/videos/<id>/<title>.mp4`. Characters that filesystems
  reject (`:`, `?`, `/`, quotes, and so on) become spaces or a dash. Without
  `--script`, it falls back to `<id>-<audio>-v<variant>.mp4`.
- `--out` must stay inside `video-render/videos/<id>/` or
  `video-render/videos/tests/`; anything else is rejected.
- Recipes live outside the videos folder: `video-render/work/<id>/manifest.json`
  plus `<stem>.plan.json`. `--keep` also saves `<stem>.composition.json` there.
- Test renders go to `video-render/videos/tests/` via
  `--out=video-render/videos/tests/<name>.mp4`.
- Follow the authoring sources above before creating a final-video plan.

## Engine A/B test (2026-11-01)

Same audio (45.696 s), same bank of 4 images / 4 clips, same brief and the same
1431 frames at 1080×1920/30 fps. Remotion with 3 workers; HyperFrames 0.8.226
with `--crf=20` and 3 workers.

| Engine | Time | Size | Output | Authoring |
| --- | --- | --- | --- | --- |
| Remotion 4.0.537 | 33.2 s | 21 MB | 3.6 Mbps | JSX plan validated by the engine |
| HyperFrames 0.8.226 | 37.0 s | 35 MB | 5.9 Mbps | HTML+GSAP with layout `check` |

Visual quality was equivalent in the compared frames. **Remotion** is kept: it
was already integrated, produces smaller files at the same quality and its JSX
contract detects forbidden imports and APIs before capture. HyperFrames required
a separate toolchain (Chrome, CLI and its own HTML) with no time advantage.

## Tests

```sh
node --test tests/*.test.js
python3 -m unittest discover -s tests/pipeline
```

Render tests cover voice preparation, transcription, caches, layout, capture
budget, JSX bundle, the renderer interface and the versioned audio fixtures.
