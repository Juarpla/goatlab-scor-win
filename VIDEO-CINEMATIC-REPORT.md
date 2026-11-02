# Visual direction and video measurement

Implementation of October 22, 2026. The infrastructure keeps two authoring jobs,
one capture and two workers. Resolution, duration, audio, music and hash
validation continue under the current contract.

## Direction and evaluation

Each new authoring job chooses `plan.visualStyle`: `editorial` (Freestyle /
editorial), `documentary` (Sports documentary) or `trailer` (Sports trailer). The
director chooses in the same turn based on the voice and chat preferences. They are
intentions, with free composition and no scene quotas or mandatory rotation.

The label appears in the Telegram description and is kept after releasing the job
files. Previous plans remain valid without a classification. `notes` explains the
concept, its relationship to the voice and the difference from recent pieces.
Memory incorporates style, metrics and turn duration; existing votes remain
associated with the same requestId.

CameraMove can transform photos, clips or groups, with a smooth curve and timings
local to a Sequence. ColorWash is placed above the image and below the text; the
palette is artistic, because `match` is text. FilmGrain is implemented and allowed
by the compiler for tests, but it is not announced to the director. It uses a
precomputed PNG, with deterministic offset every two frames. Promoting it requires
visual and performance evaluation with real samples.

## Real samples and retention

After delivering a verified candidate, Render tries to keep a local copy for each
category `photos`, `clips` and `graphics`, in
`$RENDER_STATE_DIR/evaluation/<category>`. It includes composition, local
resources, adjusted voice, transcription and the full MP4. There are three slots
and a total budget of 384 MB; if it does not fit, delivery continues without
saving the sample. The category is inferred from resource usage in the code and
requires confirmation by watching the MP4. A 15-25 s voice sample replaces the one
in its category if there is not yet one of that duration in the set.

`evaluation.json` records expiry after 24 h. Render cleans on startup and every
five minutes; comparison commands reject expired samples. The disk is local to the
machine: a replacement during a deployment can lose the samples. Copy the selected
ones before replacing it. No volume or external storage is added.

The set remains pending until the three confirmed categories, a voice close to
20 s and motion review of the full MP4s are available. A fixture does not replace
that evidence.

## Reproducible comparisons

`captureMs` keeps its historical meaning: wall time of `renderMedia`, including
encoding. `renderedDoneIn` and `encodedDoneIn` are Remotion values;
`resolvedConcurrency`, `parallelEncoding` and `slowestFrames` allow attributing
the cost. Parallel measurements are not added as independent stages. Sources:
[renderMedia](https://www.remotion.dev/docs/renderer/render-media),
[performance](https://www.remotion.dev/docs/performance),
[GL options](https://www.remotion.dev/docs/gl-options).

On the current machine, run each selected composition with:

```sh
node scripts/benchmark-shorts.mjs --input=/data/render-jobs/evaluation/photos --photo-max=1472,1280,1080 --workers=2 --runs=3 --output-dir=/data/bench-photos
```

Repeat for clips and graphics. Each condition uses its own temporary copy and the
same normalization as production; it updates real dimensions without upscaling
small originals. One pass with a cold bundle and three with a warm bundle are
measured, alternating order. The MP4s from the first warm pass are kept in
output-dir to review crops and zooms. The original remains intact. Summaries flag
candidates with at least 15% improvement, but they require visual review; they do
not change production automatically.

Production normalization remains at 1472×2624. Profile and version are part of the
cache, preserving URL protection for active resources. The default GL remains in
force; test `swangle` separately only if there is evidence of a bottleneck that
justifies it.

To compare the tools individually on the same material, text, duration and test
composition:

```sh
node scripts/benchmark-cinema-kit.mjs --input=/data/render-jobs/evaluation/photos --output-dir=/data/bench-kit --workers=2 --runs=3
```

It generates baseline.mp4, camera.mp4, wash.mp4 and grain.mp4 of seven seconds and
metrics.json. The composition in this test is synthetic, even if it uses real
media. Aesthetic approval of a real piece requires watching the full MP4. Grain
remains outside the prompt until it passes that evaluation.

To summarize the first six classified videos since deployment, without model calls
and with current votes:

```sh
node scripts/report-video-styles.mjs --memory=/data/director-memory/CHAT.json --since=DEPLOYMENT_ISO_DATE
```

The report returns pending samples and, per direction, number of videos, votes,
available medians and rejection reasons. A style without samples is not considered
worse. The report and benchmark run on demand; they do not generate other videos or
Telegram messages automatically. Redo is left for a later phase.

## Verification performed

All 604 JavaScript tests and 108 Python tests in the pipeline pass. The label was
tested with the real HTTP worker and simulated Telegram, including file release,
restart and rejection of an altered MP4.

A local seven-second test at 1080×1920/30 fps produced the four kit variants. In
one warm pass per variant: baseline 4.971 s, camera 4.961 s, wash 4.994 s and grain
5.796 s of render plus encoding. Grain raised the file from 92 KB to 2.87 MB in
that very compressible composition. These are data from a Mac with 12 reported CPUs
and 2 workers, with a synthetic graphic; they do not prove the cost of a real piece
on Fly. Grain remains outside the prompt.

The local photo comparison also exercised the three resolutions on a copy of a
test composition, preserving the original. It did not reach a 15% improvement and
neither production size nor GL was changed. The real samples, the review of their
full MP4s and the votes from the next six videos remain pending those jobs.

## Verified deployment

Render first received contract and kit support; then the Gateway was deployed. A
later Render correction unifies the description limit calculation with the decision
to attach full credits.

- Render: `visual-directions-20261022-cc094183123e`; shared 2 CPU, 4096 MB,
  RENDER_WORKERS=2. Health confirms styles, kit, advisory review and 55 s.
- Gateway: `visual-directions-20261022-0b93c2f2a74e`; shared 2 CPU, 2048 MB,
  GOATLAB_MAX_DIRECTORS=2. The styles module, guide, executable report and max
  reasoning were checked in the deployed code.
- Start of the six-video cohort: `2026-10-22T10:38:18.589Z`
  (Gateway startup with the new contract). Use that date in --since.

An isolated test on the real Render machine compiled and ran CameraMove, ColorWash
and FilmGrain together. It produced H.264 1080×1920 at 30 fps, AAC and an exact
duration of 2 s. Render plus encoding: 4.016 s; cold bundle: 17.176 s. It is a
technical composition with a synthetic tone, not a real narration or a comparative
benchmark. There were no model calls or Telegram sends; its temporary files were
deleted.

The determinism check produced the same decoded frames with one and two workers,
including camera and grain. At deployment close, the chat report records 0
classified samples and 6 pending.
