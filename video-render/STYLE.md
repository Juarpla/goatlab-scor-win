# Style and lessons

Permanent GoatLab preferences for Shorts. They are versioned so that opencode,
Claude and Codex start from the same criteria. Add a lesson only after it has
been tested in a real render; do not turn a hunch into a rule.

## Image

- Vivid color. High saturation without clipping; the brand green must be visible.
- Open lighting. No dark passages, crushed blacks or heavy vignettes.
- Sharpness first. Crop from the native resolution; do not upscale beyond the
  source.
- Blur is a background, transition or graphic-layer device. Never apply it to the
  subject.
- `#101412` belongs to the endcard; do not use it as the dominant content
  background.

## Text

- Subtitles `#ffe14a` with a black outline, 4 words per group as the base.
- No double subtitle layers or manual offsets: `words` already arrives in the
  final timeline.
- Safe area: 160 px top, 340 px bottom, 60 px left, 160 px right.
- Text must be readable from 40 px on a phone.
- Do not darken the whole frame to make the text readable; use a band or a local
  gradient.

## Editing

- Every usable clip appears at least once.
- Clips lead when they exist; images support them.
- Use 2 to 4 figures from `facts`. Never invent statistics or percentages.
- Vary the concept between audios. Do not repeat a template with only the text
  changed.
- A cut on the voice usually reads better than a slow fade.

## Delivery

- 1080×1920, 30 fps, H.264/AAC, ≤55 s and <45 MB.
- 0.5 s intro + voice + 0.5 s outro + 1 s endcard with the logo.
- Music is mandatory (`music: true`).
- Review at least 5 frames plus the endcard before delivery.

## Lessons from the engine A/B test (2026-11-01)

- Remotion and HyperFrames produce equivalent quality with the same material.
- Remotion was faster with the same number of workers (33 s vs 37 s) and produced
  smaller files at the same CRF (21 MB vs 35 MB).
- HyperFrames provides a useful layout `check`, but it requires Chrome, a CLI and
  its own HTML; it does not pay off as a second engine.
- The engine-validated JSX plan detects forbidden imports and APIs before
  capture, which saves failed renders.

## Alignment lessons

- The script is the master text; Mistral provides the clock.
- Do not edit timings by hand. Fix the reference text.
- With `--script` but no `--script-n`, the CLI picks the script with the highest
  match and logs it as `guion: script N, NN%`.
- Below 50% match, use the raw transcription rather than a wrong reference.
