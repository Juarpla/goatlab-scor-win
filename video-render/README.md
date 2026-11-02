# video-render

Local GoatLab Shorts renderer. It takes an audio track, a media pack and a JSX
plan, and delivers a 1080×1920 MP4 with voice, music and subtitles. There is no
remote worker and no Fly.io: everything runs on this machine.

## Structure

```
video-render/
  engine/                 engine: preparation, transcription, alignment, caches
  render/remotion/        Remotion project, kit, assets, bundle and render
  STYLE.md                preferences and lessons (versioned)
  videos/                 delivered MP4s (ignored by git)
  work/                   plans, QA and references (ignored by git)
```

- `engine/short-job.mjs` orchestrates voice, transcription, photos, clips and composition.
- `engine/transcribe.mjs` uses Mistral (Voxtral) and falls back to whisper.cpp.
- `engine/reference-timing.mjs` aligns the script with the heard words.
- `render/remotion/authored-composition.mjs` validates and compiles the JSX plan.
- `render/remotion/remotion-render.mjs` captures and encodes.

## Requirements

Node 22.12 or later, ffmpeg and ffprobe. Render dependencies:

```sh
npm ci --prefix video-render/render/remotion
```

Keys go in `.env` (never in git): `MISTRAL_API_KEY`, `OPENCODE_GO_API_KEY` and
the R2/Agnes keys if media banks are generated.

## Usage

```sh
node --env-file=.env scripts/render-short.mjs \
  --match=real-racing-club-vs-real-madrid-2026-11-01 \
  --audio="$HOME/Desktop/goatlab-audios/Track-93.m4a" \
  --script=public/data/youtube-scripts/real-racing-club-vs-real-madrid-2026-11-01.json \
  --script-n=6 \
  --plan=video-render/work/<id>/<slug>/plan.json \
  --out=video-render/videos/<id>-<slug>-v1.mp4 \
  --variant=1 --keep
```

- `--script` is optional; with it, subtitles use the script text and Mistral's
  timings. `--script-n` fixes the script; without it, the CLI picks the best match
  against every script in the file.
- Without `--out`, the MP4 goes to `video-render/videos/`.
- `--keep` saves `composition.json` next to the MP4.
- Each render appends an entry to `manifest.json` in the output folder (match,
  audio, plan, chosen script, score, duration, bytes and date).
- The `video-render` skill contains the full workflow, creative direction and
  authoring guide.

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
budget, JSX bundle and composition contract.
