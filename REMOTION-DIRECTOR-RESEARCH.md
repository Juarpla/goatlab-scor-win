# Creative video direction in OpenClaw and Remotion

Research from October 21, 2026. Read-only review of sources and code: it does not
install skills or change production.

It complements [VIDEO-SKILLS-RESEARCH.md](VIDEO-SKILLS-RESEARCH.md), the September
27 research on the Hermes catalog and editing skills. This document re-reads the
relevant source files and evaluates them against OpenClaw and the current GoatLab
engine.

## Recommendation

Use the official Remotion skill as OpenClaw's technical knowledge and complement
GoatLab's own instructions with editorial direction. For every video to be able to
have a new composition, what Render accepts must also be extended: installing
instructions does not remove the engine's limitations.

Remotion publishes `remotion-best-practices`, which gathers its skills, and specific
modules for creating compositions, writing React, exporting and handling subtitles.
The most relevant option is the official package, especially `remotion-markup` and
`remotion-create`. [Official catalog](https://www.remotion.dev/docs/ai/skills),
[official repository](https://github.com/remotion-dev/skills).

Snapshot read: commit `039e8a2fc78b67efc228d5645367838b85818a1c`, declared version
`4.0.537`. The project's current engine pins Remotion `4.0.533` in
`fly/render/package.json`. A later installation must pin a compatible revision and
verify its examples against that version; do not automatically update the engine as
a side effect.

## What each skill contributes

| Official skill | Verified contribution | Fit in GoatLab |
| --- | --- | --- |
| `remotion-best-practices` | Directs the agent to the relevant references. | General entry point; keep references and auxiliary files complete. |
| `remotion-markup` | Frame-based animation, composition, media, transitions, crops, text and effects. | Technical basis for writing new compositions and motion. |
| `remotion-create` | Composition construction and scene layout. | Can guide the original composition per video. |
| `remotion-render` | Video and frame export; transparency. | Execution reference for Render, which already has its own renderer. |

Sources inspected: [main SKILL](https://github.com/remotion-dev/skills/blob/039e8a2fc78b67efc228d5645367838b85818a1c/skills/remotion-best-practices/SKILL.md), [markup](https://github.com/remotion-dev/skills/blob/039e8a2fc78b67efc228d5645367838b85818a1c/skills/remotion-markup/SKILL.md), [create](https://github.com/remotion-dev/skills/blob/039e8a2fc78b67efc228d5645367838b85818a1c/skills/remotion-create/SKILL.md), [render](https://github.com/remotion-dev/skills/blob/039e8a2fc78b67efc228d5645367838b85818a1c/skills/remotion-render/SKILL.md).

The layout reference recommends establishing the focus of each scene, safe space
and legible text; it does not prescribe quotas for photos, clips or graphics. These
are useful composition guidelines, not a quality guarantee or an independent
editorial director. [Video layout](https://github.com/remotion-dev/skills/blob/039e8a2fc78b67efc228d5645367838b85818a1c/skills/remotion-create/video-layout.md).

Two third-party candidates from the previous report were re-read and are not the
main recommendation:

- [`short-form-video`, by iart-ai](https://github.com/iart-ai/tiktok-video-skills/blob/main/skills/short-form-video/SKILL.md): it proposes visual changes every two to four seconds and mandatory subtitles. Its hook advice can serve as a reference, but adopting the whole skill would reintroduce obligations the user wants to remove. Its retention percentages were not verified and do not support this recommendation.
- [`chart-animation`, by iart-ai](https://github.com/iart-ai/data-animation-skills/blob/main/skills/chart-animation/SKILL.md): it contributes counters, data interpolation and per-frame charts. It also promotes a common template applied to many datasets; useful as a specific technical reference, poorly suited to directing videos that must differ visually.

The main router is oriented toward interactive work: it asks to open Studio and
reserves rendering for explicit requests. For the already authorized Telegram flow,
the integration instructions must explain that Render exports automatically after
review; do not copy that interactive behavior without context. The skill contributes
knowledge, not another model or an inference provider.

## Compatibility with OpenClaw

OpenClaw uses the AgentSkills format and discovers skills in `<workspace>/skills`;
the file requires a name and description. The Remotion skill format is compatible
in principle. In this installation it is advisable to include the complete folder
in `fly/gateway/workspace/skills/` so it travels with Docker, preserving relative
references. This is an integration proposal; it has not been installed.

The check was also made against the [OpenClaw v2026.9.6
documentation](https://github.com/openclaw/openclaw/blob/v2026.9.6/docs/tools/skills.md),
the version pinned by the Dockerfile, in addition to the [current
documentation](https://docs.openclaw.ai/tools/skills). A skill does not grant tools,
dependencies or permissions that are absent.

## Why videos would still look alike with only the skill installed

Local finding: `fly/gateway/creative-director.mjs` asks OpenClaw to write a JSON
decision and instructs it not to change other files. `src/lib/edit-plan.js` limits
the known graphics families. The bundle of `fly/render/remotion/short.jsx` and
`editorial.jsx` contains prebuilt implementations with repeated positions,
backgrounds, typography and movements.

`Photo` supports `layer.box`, so photos can occupy regions. By contrast, the clip is
drawn with `inset: 0`, full width and height: several clips do not form a real split
screen. Editorial motions include a full background; some graphics cards are opaque.
This limits transparency and free composition even though the direction text no
longer requires alternation.

The pool of four photos and two clips is a production/availability decision,
distinct from requiring all of them to be used. `server.mjs` still truncates to that
inventory; the workflow sends a minimum of zero. Separating both decisions avoids
confusing a resource budget with a mandatory edit. The current endcard is fixed at
three seconds and the instructions keep music, subtitles and style constant: they
also require revision if the only editorial requirement will be a brief logo at the
end.

## Transparency and proposed freedom

To overlay graphics on a photo or clip in the same Remotion, it is enough to draw
text, SVG or elements without a background panel covering them. There is no need to
export another video with alpha. If an independent transparent file is desired,
Remotion documents ProRes 4444 and WebM VP9 with alpha. [Official transparency
reference](https://github.com/remotion-dev/skills/blob/039e8a2fc78b67efc228d5645367838b85818a1c/skills/remotion-render/transparent-videos.md).

Proposal, not yet implemented: OpenClaw designs and writes a React composition per
video; Render compiles and runs it in an isolated environment with allowed media and
dependencies. OpenClaw reviews the result and modifies that composition when it
requests corrections. Render keeps transcription and execution without adding
another LLM. This allows transparent overlays, two or three regions, typography and
rhythms specific to each narration. Reusing technical utilities can still be
convenient without reusing a complete visual template.

The preference for transparent graphics and diversity must be an editorial
guideline, not a new quota of overlays or panel count. Keep the 55-second maximum
and the brief final logo as editorial requirements; keep the technical checks needed
to run and deliver the file. To avoid repeating edits between videos, OpenClaw would
also need to receive a visual summary of recent compositions: an isolated skill does
not supply that memory.

## User's audiovisual reference: effects on video

Reference reviewed on October 21, 2026: `/Users/juarpla/Downloads/2026-10-21
02.49.43.mp4` (24.52 s, 576 × 1024, 30 fps). The attachment initially pointed to a
path in the home directory; the same name was found in Downloads. Frame sequences
were inspected at four samples per second plus an overview. The following times are
approximate. This review evaluates image and visual changes; it does not analyze the
sound mix or attribute the tools used to produce the original.

The main pattern is a continuous shot with text, cards and small overlaid videos.
Layers are introduced and removed without permanently replacing the background. It
is an appropriate reference for the user's preference for graphics without a
background. The cards in the original do have their own panels; only the text,
lines or outlines can be kept when it is better to show more media.

| Reference observed | Approximate time | Proposed adaptation for GoatLab |
| --- | --- | --- |
| Kinetic text, falling words and large typography | 00–03 s | Highlight words from the voice, team names or a real figure with entries and scales specific to each piece. Avoid a second full transcription competing with subtitles. |
| Bar with progressive typing | 03–04 s | A brief question, concept or headline typed over a photo or clip; the search-bar look is not mandatory. |
| Strip of floating cards, called Storyboard deck | 04–05 s | Bring in several photos or crops, rearrange them and leave the resource matching the narration as the protagonist. |
| Small overlaid video, called File drop, and later video card | 07 s and 17 s | Clip in one region with text or graphics in another; switch between full-screen image and split composition without a fixed template. |
| Color comparison via a slider and treatment change | 10–13 s | Optional resource for visual comparisons or emphasis. If it compares data or teams, label the meaning; the original effect shows color treatment, not statistics. |
| Grid with several pieces, called Playing grid | 15 s | Two or three regions of photo, video and graphic, with one main focus and synchronization with the voice. The number of panels is left to the director's judgment. |
| Vertical wipe with blur toward another shot | 16 s | A one-off transition between ideas, with direction and duration designed for that cut. |

Do not prioritize simulating an editing timeline, struck-through app icons or calls
to comment EDIT: they serve a promotional function in the reference video, not the
sports narration. The GoatLab endcard remains a brief logo at the end.

Incorporate these references into the plan together with `remotion-create` and
`remotion-markup`, without creating another closed catalog or usage quotas. OpenClaw
must be able to generate the specific composition and animation for each video,
favoring transparent overlays when they work, with freedom to omit these effects. To
differentiate pieces, receive examples or summaries of recent edits, not just
randomly vary effects. Render keeps the transcription and runs the result without
another creative model. Production was not modified or deployed during this review.
