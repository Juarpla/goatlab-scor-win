# Creative freedom and limits of the video pipeline

> Historical report of the October 2026 remote pipeline. This is not a current
> authoring policy. For final videos, read the
> [local workflow](.agents/skills/video-render/SKILL.md),
> [creative direction](.agents/skills/video-render/references/creative.md) and
> [fixed identity](.agents/skills/video-render/references/brand.md).
> Model names, review behavior, optional music/captions and machine limits below
> describe that historical system.


Implementation of October 21, 2026. This report describes the new path for JSX compositions (plan 5); plans 1-4 are kept for manual compatibility, not as a fallback edit.

## What OpenClaw decides

The level of freedom is high for composition and programmable 2D animation, within a defined runtime. It is not a measured grade or a quality guarantee. It used to choose existing graphic families; now it writes a complete React/JSX module per audio, with its own helpers, SVG, masks and styles. It can change typography, color, size, layout, density, motion, transitions and sequences; combine photos and clips in two, three or more regions; make text, strokes, cards and graphics appear without a background; use all, part or none of the inventory. The reference video's effects are inspiration, not mandatory steps.

The official skills remotion-create and remotion-markup are installed in the Gateway workspace, with their references and UPSTREAM.json. Authoring turns receive both SKILL.md files preloaded, without depending on the model reading them before writing. They are pinned to commit 039e8a2fc78b67efc228d5645367838b85818a1c, skill 4.0.537, interpreted for the existing runtime 4.0.533. GoatLab's contract adapts the interactive guide to the automatic flow: it does not open Studio or install dependencies per audio. The artistic catalog was removed from the main path; alternation, motion percentage, cut frequency or a minimum number of photos, clips or subtitles are not required.

OpenClaw chooses whether to include subtitles and how they look, using the transcribed timings. It also chooses whether music is present. The available music is the existing bed; the voice mix remains Render's responsibility. The engine adds the GoatLab logo during the last second, inside the 55-second total maximum. The shape, size and background of that endcard are fixed.

DeepSeek deepseek-v4.1-flash is primary and GLM glm-5.3-flash is the fallback, through OpenCode Go, both inside OpenClaw. Render keeps Mistral Voxtral and Whisper for transcription and runs Remotion/FFmpeg without a creative model. The supervisor keeps up to six recent concepts from the same chat in the 24-hour private state; it helps vary, but it does not automatically compare the visual similarity of previous videos or guarantee that resources or styles are never repeated.

## Rigidity that remains

| Area | Current limit | Consequence |
| --- | --- | --- |
| Delivery format | Vertical 1080×1920, 30 fps, H.264 and AAC. | It cannot choose another aspect ratio, resolution, fps or codec. |
| Duration | At most 1650 frames (55 s), final logo 30 frames (1 s). | All content must fit before the logo. |
| Voice | 0.5 s intro and 0.5 s margin; voice budget 53 s. Maximum speed 1.10. | An audio up to 58.3 s can be adjusted; at the edge, codec padding can also prevent fitting it without exceeding 1.10. A longer one is asked to be replaced. Recording up to 50 s is recommended. The spoken text is not modified. |
| Music | `music` boolean, one existing bed, mixer volume and normalization. | It does not compose music or choose other tracks or sound effects. |
| Drawing tools | React and a Remotion interface with hooks, SVG, CSS and local image/video adapters. | It cannot add packages, plugins, Three.js, Lottie or remote fonts on its own. It can create helpers and original graphics with these tools. |
| Resource bank | Actions still produces four images and four clips per match. Only Agnes media over HTTPS is admitted. | The edit has no quotas, but bank availability and provenance policy still limit the possible resources. Changing bank generation is another change. |
| Review | Frames per scene, uniform sampling every 2 s and the endcard. | It does not listen to audio or inspect continuous motion. Fast defects or fine synchronization errors can pass undetected. There is no complete static test of readability or determinism for all generated CSS/JS animation. |
| Corrections | First candidate and up to two corrections; three technical plan attempts per phase. | It may end without an approved video even if the file is shorter than 55 s. There is no automatic template substitution. The 55 s is output duration, not a limit or promise of production time. |
| Capacity | One capture at a time; Render 2 shared CPUs / 4 GB. Compilation 180 s, heap 768 MB; capture 20 min. | Complex code can exceed the time/memory budget. The three candidates also include failed capture attempts. |
| Model response | maxTokens:32768 per response, not mandatory consumption. | Reasoning and code can exhaust that ceiling; truncation can prevent saving the composition. |
| Session | Job with a maximum 24 h expiry, cancellation and identified generations. | An expired or replaced piece requires a valid request; an old approval is not published. |

## What can prevent delivering a video shorter than 55 seconds

Duration is the only editorial time maximum. It does not mean any short file is executable or deliverable. These checks remain active:

1. **Audio and transcription:** audio with a finite positive duration; speed budget; non-empty transcription and valid timings inside the voice (0.3 s tolerance). Voxtral falls back to Whisper; if both fail, the text is not invented and the edit is not delivered.
2. **Code contract:** plan version:5, non-empty JSX code, maximum 200 KB, module with default export and valid syntax. Imports from react and the allowed remotion interface; no dynamic imports, re-exports, Node APIs, external network or direct global DOM access. At least one valid scene interval is declared for review, but quantity, minimum artistic duration, alternation or contiguous coverage of that list are not required. Content is drawn during contentFrames; the engine reserves the logo.
3. **Compilation and execution:** JSX/JavaScript errors, an unrenderable component, missing resources, failing expressions, expensive animation or endless waits can fail before producing an MP4. Diagnostics return to OpenClaw for correction. Compilation happens in a process with a reduced environment and limits; generated code is bundled, not evaluated/imported in Node. It runs in Chromium with a network CSP and media adapters limited to this job. This does not create a separate OS machine or container per video and is not presented as invulnerable isolation.
4. **Media:** files that do not download or decode are omitted from the prepared inventory; OpenClaw can continue without them. Photos are normalized, without creating new detail; download limits 64 MiB per photo and 32 MB per clip; approximate caches of 128 MB per type. There is no artistic maximum clip duration in Render or cutdown of the number of resources received. Resources external to the job are not available to the composition code.
5. **Request and data:** valid Bearer; valid chat and identifiers; variant 0-9; valid audioFileId or HTTPS audioUrl; job not expired; HTTP JSON up to 1 MB; assets/clips as lists with Agnes provenance. Facts still require finite non-negative data, id, label, unit and source, with up to 128 records. Text or numbers drawn by free JSX are not automatically compared with that catalog: that semantic check depends on OpenClaw's authoring and review. Motion Prompts are an informational list without quotas or mandatory families. An invalid request can be rejected before the edit.
6. **Final MP4:** valid video and audio, defined format, 30 fps, finite duration ≤55 s and difference from the job budget ≤0.1 s; file smaller than 45 MB. A 40 s video with wrong dimensions or excessive size can be rejected. There is no editorial minimum duration of five seconds: there is a positive number of content frames in addition to the logo and voice margins. On the normal voice path, those margins and the logo make the minimum output approximately 2.03 s.
7. **Visual verdict:** OpenClaw can request corrections for illegible text, framing, overlays or inconsistencies. To approve, all frame batches must be approved. Transparency, diversity and rhythm are preferences; there are no numeric thresholds that turn them into quotas. Quality remains the model's decision and can fail or be too conservative.
8. **Exact delivery and recovery:** generation, review, plan hash and MP4 hash must match; receipts for all frames and observations are required. The byte hash is checked again before sending. A cancelled, changed, obsolete or unapproved candidate is not delivered. An uncertain Telegram send is not duplicated automatically. Technical retries are idempotent; only an explicit retry changes the token to start another generation after a failure.
9. **Providers and operations:** OpenClaw can exhaust a turn's time, the model can fail to return valid JSON/code, the provider can fail or rate-limit, and Telegram can reject a send. GLM fallback, startup checks, persistence and recovery exist; they do not remove those external limits.

## Tests and deployment

- Repository general suite: 582 Node tests and 103 Python tests passed; Astro build, syntax and skill synchronization passed. It includes a case that returns a JSX ReferenceError to OpenClaw and requires a new capture before approval. The HTTP check keeps 11 photos and seven clips without trimming the inventory.
- Real render: photo and clip in separate panels with SVG/text without a background panel; another composition with graphics only, no media; inspection of both and the one-second endcard.
- Real limit: H.264/AAC MP4 of exactly 55.000 s and 1650 frames, with a 53 s synthetic voice and music disabled.
- Real API with simulated Telegram: compiled JSX, 5 s MP4, nine review frames, approval and delivery of the same bytes by hash. The transcription was prepared and the verdict of that test was simulated. Old real audios were not resent and no test videos were published to the user.
- Native DeepSeek: wrote 4848 characters of original JSX through the deployed OpenClaw. The module was validated, compiled and rendered without manual editing, both locally and in the Fly Render app. Its three-region composition was inspected.
- Native GLM: a compact request produced 1335 characters of original JSX, compiled and rendered locally without manual editing. Another attempt with both skills preloaded, after the budget adjustment, saved a new 1769-character composition. The latter failed to render because of unimported hooks. The ReferenceError was returned to the same model; GLM fixed the imports while preserving the design (1863 characters) and that module compiled and rendered locally without manual editing.
- Deployment to the two existing Fly apps, revision authored-20261021. Render announces editPlanVersion:5, authoredCompositions:true, maxSeconds:55 and endcardSeconds:1. Server and remote compiler hashes match the local code. Both skills are present in Gateway. Render keeps Mistral/Whisper and has no creative credentials.

The samples verify authoring, composition and execution paths; the editorial quality of future pieces depends on each narration and its review. The freedom assessment describes available tools and decisions, not a measured artistic score.

## Response limit observed during testing

In one GLM attempt with the skills preloaded, OpenCode Go returned HTTP 200 and OpenClaw logged stopReason=length, with no payload or completed tools. It was response truncation before saving code, different from an artistic or duration rejection. maxTokens:32768 is now explicitly configured in both model definitions, instead of relying on an implicit value for custom models. reasoning_effort is not changed and no LLM client is added to Render.

The later attempt with that budget and both skills preloaded did save code. The ceiling still exists and can be consumed between reasoning and code. It is a requested limit, not mandatory spending or a guarantee that any complex piece will finish.

As a reference for choosing that budget, the [GLM-5.3-Flash maker](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash) publishes up to 128K output for the base model. This does not prove that an intermediary always grants that maximum. The earlier real test confirms that the OpenCode Go/OpenClaw path accepted the configuration and completed authoring in that case.

Final check: both authoring and code correction were tested with native OpenClaw turns. GLM's real correction and the automated error-return case confirm the intended repair path; the full editorial verdict with a real user's voice was not tested by sending Telegram messages. The idle shutdown control was left resumed after the isolated tests.
