# Video pipeline optimization and manual review evaluation

> Historical report of the October 2026 remote pipeline. This is not a current
> authoring policy. For final videos, read the
> [local workflow](.agents/skills/video-render/SKILL.md),
> [creative direction](.agents/skills/video-render/references/creative.md) and
> [fixed identity](.agents/skills/video-render/references/brand.md).
> Model names, review behavior, optional music/captions and machine limits below
> describe that historical system.


The expansion of visual direction, optional tools, sample retention and comparison
commands is described in [VIDEO-CINEMATIC-REPORT.md](VIDEO-CINEMATIC-REPORT.md).
The historical measurements in this report are not results from the new kit.

## Lanes and parallel authoring

Render prepares and delivers through a lightweight lane and captures one at a
time. Gateway directs one audio at a time (`GOATLAB_MAX_DIRECTORS=1`). Each video
responds to the original audio and includes "Like" / "Dislike". Those marks stay
in `director-memory` and return to authoring as preferences, not as rules.

The Render machine remains shared-cpu-2x with 4 GB and `RENDER_WORKERS=2`. The
text detector stays advisory (`LAYOUT_CHECK` defaults to `advisory`). The "Redo"
button remains outside this change.

Date: October 21, 2026.

## Machine benchmark (fixture, Oct 21 2026)

Measured in `iad` with image
`registry.fly.io/goatlab-render:deployment-01M5G38NXSQ409FDTAP95KAZQ2`
(`7b9bd2a`). The command was `node scripts/benchmark-shorts.mjs --fixture`,
with `LAYOUT_CHECK=off` and the capture budget disabled. The fixture has 330
frames (11 s): synthetic photos, blurs, a 4 s clip, a card and the logo. It is not
the October 21 JSX, which was no longer on the server. That video took 15 min 38 s
to capture; these figures serve to compare machines, not to predict that video.

Temporary machines were deleted at the end. Production was not touched.

Rates used (Fly, `iad`, October 2026): shared-cpu-2x with 4 GB ≈ $0.0353/h
(512 MB base plus extra RAM); performance-2x with 4 GB = $0.0917/h;
performance-4x with 8 GB = $0.1833/h. Cost is rate × `captureMs`. A 55 s video is
projected as 5× the capture of this fixture (1650/330).

| Machine | Workers | Capture 11 s | fps | Capture cost 11 s | 55 s projection | Projected cost |
|---|---:|---:|---:|---:|---:|---:|
| shared-cpu-2x, 4 GB | 1 | 38.7 s | 8.5 | $0.00038 | 3 min 14 s | $0.0019 |
| shared-cpu-2x, 4 GB | 2 | 28.1 s | 11.7 | $0.00028 | 2 min 21 s | $0.0014 |
| performance-2x, 4 GB | 2 | 32.6 s | 10.1 | $0.00083 | 2 min 43 s | $0.0042 |
| performance-4x, 8 GB | 4 | 17.8 s | 18.5 | $0.00091 | 1 min 29 s | $0.0045 |

The 2-worker shared row is the second pass on the same machine (the bundle was
already warm, 251 ms). `captureMs` does not include the bundle. The other rows
paid a cold start (bundle 11-14 s). Even so, performance-2x did not beat
shared-cpu-2x. performance-4x captured about 1.6 times faster than shared with 2
workers and costs about 5 times more per hour. On this fixture, the time saved
does not justify the price.

Production stayed on the second row: shared-cpu-2x, 4 GB and `RENDER_WORKERS=2`.
The machine did not change. `--photo-max=1080` and `REMOTION_GL` remain
unmeasured.

## Starting point

In the October 21 test, a single audio measured:

| Stage | Time |
|---|---:|
| Transcription with Mistral | 3 s |
| Compilation, capture and encoding | 15 min 38 s |
| Extraction of 52 frames (52 FFmpeg processes) | 6 min 51 s |
| Visual review | 9 model calls and a final verdict |
| Authoring | several minutes for timeouts, retries and one correction |

## Contract at the time of this report

**Duration.** The only editorial maximum is 55 s, including the final logo. Render
rejects any MP4 that exceeds it. It also requires AAC voice, H.264 at 30 fps,
1080×1920 and less than 45 MB.

**Advisory review.** A single FFmpeg pass extracts 8 JPEGs at 540×960 with a fixed
sample, including the endcard. Gateway makes **one** visual call with `max`
reasoning and a 60 s budget per model. `approve` and `revise` both deliver the
same MP4. If the review fails, delivery is recorded as `reviewStatus:
unavailable`, without claiming that an inspection happened. The final verdict and
automatic visual corrections no longer exist.

**Authoring.** Uses `max` reasoning, with 240 s per turn and 15 s of margin. There
is one initial candidate and a single technical correction (`MAX_CANDIDATES = 2`).
An invalid plan allows two attempts, and the second one uses GLM directly. The
turn receives GoatLab and `goatlab.win` as official data (also in the
`brandName`/`brandUrl` props).

**Retries.** Turn admission allows a single retry if OpenClaw is not ready yet.
Before moving to the fallback model, the previous turn is cancelled with
`chat.abort`. If that cancellation is not confirmed, no other turn is opened. A
failure is recorded in the `.run` file and is not repeated within the same Gateway
instance.

**Render.** Uses Remotion 4.0.537 with parallel encoding, `x264Preset: veryfast`
and CRF 20. It shares a single browser for selection, preflight and capture.
Before full capture, preflight measures frames at scale 1 (one warm-up and three
samples) and projects the capture. If the projection exceeds `CAPTURE_BUDGET_MS`
(18 min), Render returns `CAPTURE_BUDGET` and that pass counts as the technical
correction. FFmpeg uses at least two threads.

**Reasoning.** `openclaw.json` declares `reasoning: true` and
`supportsReasoningEffort` with `low`/`high`/`max` for both OpenCode Go models. Each
turn sends `thinking: max`. It is worth confirming in the first real record that
OpenCode Go receives `reasoning_effort` with the expected value.

**Verification without long tests:**

- All 584 unit tests pass. They cover sampling, wait budgets, cancellation before
  fallback, unavailable review and the absence of re-render on suggestions.
- A local 2 s synthetic render with JSX produced H.264 1080×1920.
- No real audios or model calls were used.

**Pending measurement with a real audio:** a video of about 20 s. The `stages` of
that job (`capture`, `mux`, `reviewFrames`) and `job.metrics` are compared with the
test above. The machine benchmark, above, uses a fixture.

## Evaluation: remove the review and/or the authoring

### Option A — Remove the review and keep authoring (recommended)

Render validates duration, format, audio and size, and delivers directly. You
review the video in Telegram.

- **Saving:** one visual call (up to 60-75 s) and frame extraction (now ~seconds).
  The largest remaining cost is capture.
- **Required change (small):** `directVideo` calls `/render/approve` with
  `reviewPolicy: 'advisory'`, `reviewStatus: 'skipped'` and no `reviewedFrames`.
  `approveCandidate` must accept `skipped`, and Render may skip
  `extractReviewFrames`. A `VIDEO_REVIEW=off|advisory` variable is advisable so it
  can be reverted without deploying code.
- **Kept:** hash authorization. It is not an artistic veto, but what prevents
  delivering a different MP4 or one from a replaced/cancelled version.
- **Risk:** nobody detects clipped text before it reaches Telegram. Today the
  review no longer blocks, so the real risk barely changes: only the
  informational note is lost.

### Option B — Also remove authoring

Without authoring, someone has to decide the edit. The alternatives are:

1. **Deterministic templates (legacy plans 1-4).** Render already knows how to run
   them. The plan would be generated in code from the words, photos and facts. It
   would be the fastest mode with no model cost, but every video would look alike.
   It also contradicts the current design decision ("there is no automatic
   fallback edit"), recorded in `CREATIVE-FREEDOM-REPORT.md`.
2. **Authoring on demand only.** By default a template is delivered, and a
   Telegram button requests an original version from OpenClaw (`max`).

**Recommendation:** start with A and measure. If capture still dominates or
authoring fails often, implement B.2 as a "fast mode" through a per-series option,
without removing authoring.

## Proposed design: redo a video from Telegram

### Experience

1. Render sends the MP4 with two inline buttons: **🔁 Redo** and
   **✏️ Redo with note**.
2. **Redo** requests a new composition for the same audio.
3. **Redo with note** replies "Write what to change" (`force_reply`). The text of
   your reply is passed to OpenClaw as a user indication.
4. The new video arrives as a reply to the original message
   (`reply_parameters.message_id`). The previous one is kept.
5. Text alternative: `/rehacer 3 subtítulos más grandes` (script number of the
   active series).
### Data and state

- `callback_data` has a maximum of 64 bytes. Use `redo:<12 hex of requestId>` and
  resolve the audio in SQLite (`audios.id`).
- **Idempotency:** store `callback_query.id` and always respond with
  `answerCallbackQuery`. A second tap while redoing answers "already in progress".
- **Limits:** maximum 2 redos per audio, and only while the series has not expired
  (`expiresAt`, 24 h). Only the owner chat can request it.
- The user note is stored as data, not as a system instruction. It is injected into
  the authoring prompt as "User request (content)".

### Changes per component

| Component | Change |
|---|---|
| Render `sendVideo` | Add `reply_markup` with the buttons and accept `replyTo`. |
| Render after delivery | Today it deletes the job folder. Keep `prepared.json` and the adjusted voice until `expiresAt` (or re-prepare with `audioFileId`, which remains valid in Telegram). |
| Render API | `POST /render/redo {jobId, note}`: new generation (`attempts++`), `revision = 0`, state `awaiting-plan`, without transcribing again. |
| Gateway webhook | Process `callback_query` with the `redo:` prefix outside the agent, like `/start`. Enqueue a `redo` task in the `workflow.py` outbox. |
| `workflow.py` | New `kind: 'redo'` that calls `/render/redo` and launches `creative-director.mjs` with `{..., redoNote}`. |
| `creative-director.mjs` | Include `redoNote` and a summary of the previous plan in the prompt, asking for a different composition. |
| Tests | Double tap, note with embedded instructions, redo after expiry and redo of a cancelled or replaced audio. |

### Cost per redo

One `max` authoring call and a full capture, without transcription or media
download. Review depends on whether option A is adopted.

### Suggested order

1. Option A with `VIDEO_REVIEW=off` and measurement of `stages` on a short real
   audio.
2. **Redo** button without a note (Render + webhook + outbox).
3. **Redo with note**.
4. Evaluate the "fast mode" with templates (B.2) based on the measured times.
