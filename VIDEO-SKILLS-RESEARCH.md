# VIDEO-SKILLS-RESEARCH.md

**Which agent skills exist for editing short videos like TikTok/Reels/Shorts (burned-in subtitles, transitions, dynamism and data overlays)? Does Hermes have a skill hub for that?**
Date: 2026-09-27 · Scope: the **Hermes Agent (Nous Research)** Skills Hub and the registries that hub integrates (official Hermes skills, skills.sh, ClawHub, LobeHub, browse.sh, GitHub taps). Nearby primary registries are also reviewed (Agent Skills / agentskills.io, `anthropics/skills`, ClawHub/OpenClaw) and vendor skills that the hub indexes (Remotion, HeyGen HyperFrames).
Method: I downloaded the hub's public index (`skills.json`, 100,839 entries) and filtered it by *video, caption, subtitle, ffmpeg, remotion, tiktok, reels, shorts, karaoke, transition, motion, overlay, chart*. For each candidate I opened its `SKILL.md` or README in the source repository (GitHub raw), its skills.sh page or its ClawHub listing (web or API). Every URL cited was opened today.
Out of scope: testing or installing skills, measuring render quality, third-party blogs or lists, and proposing changes to this repo.

**Marks used**

| Mark | Meaning |
|---|---|
| ✅ VERIFIED (docs) | Official page or `SKILL.md`/README opened on 2026-09-27 |
| 🟡 LIKELY | The project hints at it (index or listing), but I could not open the detail |
| ⛔ NOT FOUND | It was searched in the hub and no skill does that |

**Watch the name.** "Hermes" here is **Hermes Agent**, from Nous Research ([repo](https://github.com/NousResearch/hermes-agent)). It has no relation to **Hermes, Meta's JavaScript engine** (`facebook/hermes`), which is covered in `JS-ENGINES-RESEARCH.md` and has no skills. ✅ VERIFIED (docs)

---

## Direct answer

**Yes, the hub exists and it works for this.** Hermes Agent has a public **Skills Hub** at [hermes-agent.nousresearch.com/docs/skills](https://hermes-agent.nousresearch.com/docs/skills), maintained by Nous Research. It is not its own marketplace: it indexes official Hermes skills together with third-party registries (skills.sh, ClawHub, LobeHub, browse.sh, GitHub taps and `/.well-known/skills` endpoints). It installs with `hermes skills install <source>/<path>` and every install goes through a security scanner. Skills follow the open Agent Skills standard (agentskills.io). ✅ VERIFIED (docs) — [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills).

**The user's four requests are covered**, although coverage is uneven:

- **Burned-in subtitles:** strong coverage, through three routes (FFmpeg/ASS, Remotion or HyperFrames).
- **Transitions:** well covered (FFmpeg `xfade` or HyperFrames shader transitions).
- **Rhythm and dynamism:** short-form guides exist (hook, pattern interrupts every ~2-4 s, loops) and a beat-cut skill.
- **Statistics overlays:** only generic skills exist (count-up, animated charts). ⛔ There is no skill specific to football scorelines or statistics.

**The most useful skills (verified):**

1. **`hyperframes`** (Hermes, official optional): renders MP4 from HTML+GSAP, with word-by-word captions, TTS, shader transitions and social overlays.
2. **`remotion-captions`** and **`remotion-best-practices`** (Remotion, official vendor): transcribe, import SRT, display and animate captions in Remotion.
3. **`caption-animation`** (iart-ai): word-by-word karaoke captions, in 9:16, inside the safe area, burned in or as SRT/VTT.
4. **`short-form-video`** (iart-ai): hook → retention → loop grammar, with a pattern interrupt every ~2-4 s and punch-in zoom.
5. **`ffmpeg-captions-subtitles`** (josiahsiegel): burn SRT/ASS/VTT with styles, `drawtext` and Whisper inside FFmpeg 8.
6. **`ffmpeg-kinetic-captions`** and **`viral-video-animated-captions`** (josiahsiegel): CapCut-style captions (pop, bounce, word-grow) with ASS tags.
7. **`ffmpeg-transitions-effects`** (josiahsiegel): more than 40 `xfade` types, slideshows from images and Ken Burns with `zoompan`.
8. **`motion-graphics`** (HeyGen HyperFrames): short stat count-up pieces, charts, lower thirds and overlays, as MP4 or a transparent overlay.
9. **`chart-animation`** (iart-ai): bar chart race, counters and animated lines, all derived from the frame.
10. **`video-editing`** (Pruna AI): local post-production with FFmpeg (concat, crossfades, burned captions, lower thirds, background music, 9:16 export).
11. **`wjs-burning-subtitles`** (ClawHub): video + SRT → burned with libass or soft-mux, plus dubbing mix, in a single encode.
12. **`beat-sync-video-editing`** (ecliptic-ai): builds a cut plan synchronized with the music and renders it with `filter_complex`. Requires Gemini.

---

## 1. What the Hermes Skills Hub is

| Aspect | What the docs say | Mark | Source |
|---|---|---|---|
| Hub URL | Public "Skills Hub" page. It renders on the client; without JavaScript it shows counters at 0. | ✅ | [docs/skills](https://hermes-agent.nousresearch.com/docs/skills) |
| Hub data | Desktop and the public hub read the same CDN snapshot, `/docs/api/skills.json`. It is generated during the docs build from `skills/`, `optional-skills/` and a centralized index. Browsing does not query GitHub live. | ✅ | [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills), [skills.json](https://nousresearch.github.io/hermes-agent/docs/api/skills.json) |
| Maintainer | Nous Research, inside the `NousResearch/hermes-agent` repo. "official" skills live in `optional-skills/` and are accepted by pull request. | ✅ | [Optional Skills Catalog](https://hermes-agent.nousresearch.com/docs/reference/optional-skills-catalog) |
| Integrated sources | `official`, `skills-sh`, `well-known`, `github` (taps), `clawhub`, `lobehub`, `browse-sh` and direct URL. | ✅ | [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) |
| Today's snapshot size | 100,839 entries: ClawHub 78,612, skills.sh 20,000, GitHub 514, LobeHub 505, browse.sh 474, NVIDIA 382, optional 152, built-in 58, gstack 54, OpenAI 44, HuggingFace 25, Anthropic 19. I counted locally from the JSON; I did not verify whether the 20,000 from skills.sh is an indexer cap. | ✅ | [skills.json](https://nousresearch.github.io/hermes-agent/docs/api/skills.json) |
| Install | `hermes skills install official/<cat>/<skill>`, `skills-sh/<owner>/<repo>/<skill>`, `well-known:<url>` or a direct URL to a `SKILL.md`. Also through the "Install in Hermes" button (`hermes://skill/install?identifier=…`). | ✅ | [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) |
| Publish | `hermes skills publish skills/<skill> --to github --repo owner/repo`, or create a "tap" (a GitHub repo with `SKILL.md`) that others add with `hermes skills tap add`. | ✅ | [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) |
| Security | Everything installed from the hub goes through a scanner (exfiltration, prompt injection, destructive commands). `--force` does not override a `dangerous` verdict. Trust levels: `builtin`, `official`, `trusted` (`openai/skills`, `anthropics/skills`, `huggingface/skills`, `NVIDIA/skills`) and `community` (skills.sh, ClawHub and most marketplaces). | ✅ | [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) |
| Relation to Agent Skills | Hermes docs say its skills are compatible with the open agentskills.io standard. Agentskills.io lists Hermes Agent and OpenClaw among the products that adopt it, and says Anthropic created the format and later released it as an open standard. | ✅ | [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills), [agentskills.io](https://agentskills.io/) |
| Relation to ClawHub/OpenClaw | ClawHub is OpenClaw's public registry. OpenClaw installs with `openclaw skills install @owner/<slug>` and also accepts `skills-sh:owner/repo/slug` references. Hermes indexes ClawHub as the `clawhub` source. | ✅ | [OpenClaw Skills](https://docs.openclaw.ai/tools/skills), [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) |

Note on security warnings: the `brag` `SKILL.md` says the Hermes scanner currently blocks four of HeyGen's five domain skills (`hyperframes-core`, `-animation`, `-creative`, `-keyframes`, `-cli`). One of them, `hyperframes-creative`, scores as `dangerous`, and `--force` does not override it. By contrast, the `hyperframes` in the official catalog is a single-file port and does **not** include those domain skills. ✅ VERIFIED (docs) — [brag SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/brag/SKILL.md).

---

## 2. Catalog

Coverage: **Sub** = subtitles/captions, **Tr** = transitions, **Dyn** = dynamism/rhythm, **Data** = data overlays, **Other** = other related capabilities.

### 2.1 Hermes official (built-in or `official`)

| Skill | Hub/repo | What it covers | How it is invoked (high level) | What it does NOT do | Source |
|---|---|---|---|---|---|
| `hyperframes` | Hermes `official/creative/hyperframes` (author: heygen-com, Apache-2.0) | **Sub, Tr, Dyn, Data, Other.** HTML with `data-*` and a GSAP timeline is the video source; it renders to MP4/WebM with FFmpeg. Templates such as `kinetic-type` and `nyt-graph`. `hyperframes transcribe` gives word-by-word transcription for captions. TTS with Spanish voices (`e` prefix). CSS or shader transitions (`flash-through-white`, `liquid-wipe`…) and audio-reactive visuals. It warns against using `.en` Whisper models with non-English audio. | `hermes skills install official/creative/hyperframes` and then the `npx hyperframes init / lint / render` CLI. Requires Node ≥ 22, FFmpeg and chrome-headless-shell. | It does not do mathematical animation (that is `manim-video`) or image generation. It forces a transition between scenes: no jump cuts. | ✅ [SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/hyperframes/SKILL.md), [catalog](https://hermes-agent.nousresearch.com/docs/reference/optional-skills-catalog) |
| `kanban-video-orchestrator` | Hermes `official/creative/…` | **Other.** Meta-pipeline: asks discovery questions, writes a `brief.md`, designs a team of Hermes profiles and launches tasks on a Kanban with a "director". It asks for the aspect ratio (including 9:16). | `hermes skills install official/creative/kanban-video-orchestrator`, generates a `setup.sh` and is monitored with `hermes kanban watch`. | **It renders nothing by itself**: it delegates to other skills or to FFmpeg. | ✅ [SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/kanban-video-orchestrator/SKILL.md) |
| `ai-presenter-video` | Hermes `official/creative/…` (cclank port, MIT) | **Sub, Other.** Video with an AI presenter from a script and ONE image: narration, avatar with lip-sync QA, captions, deterministic editing with FFmpeg and loudness normalization. | `hermes skills install official/creative/ai-presenter-video`. It asks for consent before every paid generation. | It only works with a presenter (avatar); it is not designed for a photo edit. | ✅ [SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/ai-presenter-video/SKILL.md) |
| `brag` / `brag-slim` | Hermes `official/creative/…` (stub; content lives in `latent-spaces/brag`) | **Dyn, Other.** 15-25 s launch video with a selectable tone, `--format vertical`, music and SFX with beat cues. | `hermes skills install official/creative/brag` | It is for launching a software project, not for narrating content. The full path depends on HeyGen skills that are currently blocked (see §1). | ✅ [SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/brag/SKILL.md) |
| `manim-video` | Hermes built-in | **Data, Other.** Animations with Manim CE. It has a "Data story" mode (animated charts, comparisons, counters). | Included. Requires Python, Manim, LaTeX and FFmpeg. | It does not work with photos or real video. | ✅ [SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/skills/creative/manim-video/SKILL.md) |
| `whisper` | Hermes `official/mlops/whisper` | **Sub (input).** Transcription in 99 languages with word timestamps (`word_timestamps=True`). | `hermes skills install official/mlops/whisper` | It does not burn or animate subtitles: it only produces text with timings. | ✅ [SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/mlops/whisper/SKILL.md) |
| `ascii-video` | Hermes built-in | **Other.** ASCII-art video, with a "Lyrics/text" mode (audio + SRT). | Included. | It is only an ASCII aesthetic. | ✅ [SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/skills/creative/ascii-video/SKILL.md) |

### 2.2 Vendor official (indexed through skills.sh)

| Skill | Hub/repo | What it covers | How it is invoked | What it does NOT do | Source |
|---|---|---|---|---|---|
| `remotion-best-practices` (router), `remotion-captions`, `remotion-render`, `remotion-create`, `remotion-multimedia` | `remotion-dev/skills` | **Sub, Other.** The router loads the right skill. `remotion-captions` uses the `Caption` type from `@remotion/captions`, with guides to transcribe, display and animate captions and import `.srt`. `remotion-render` uses `npx remotion render` (and transparent renders). | `npx skills add remotion-dev/skills`, or `hermes skills install skills-sh/remotion-dev/skills/<skill>`. | The `SKILL.md` files are short routers: the detail lives in reference files that I did not open. | ✅ [Remotion AI skills](https://www.remotion.dev/docs/ai/skills), [remotion-captions](https://raw.githubusercontent.com/remotion-dev/skills/main/skills/remotion-captions/SKILL.md), [best-practices](https://raw.githubusercontent.com/remotion-dev/skills/main/skills/remotion-best-practices/SKILL.md), [render](https://raw.githubusercontent.com/remotion-dev/skills/main/skills/remotion-render/SKILL.md) |
| `motion-graphics` | `heygen-com/hyperframes` | **Data, Dyn.** Short motion graphic (< 10 s, up to ~30 s): kinetic typography, **stat count-up**, chart or data-viz, lower third, social overlay and animated maps. Delivered as MP4 or a **transparent overlay**. | `npx skills add heygen-com/hyperframes --skill motion-graphics` | It is not for narrated or multi-scene pieces (that is `/general-video`). | ✅ [SKILL.md](https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/motion-graphics/SKILL.md), [README](https://raw.githubusercontent.com/heygen-com/hyperframes/HEAD/README.md) |
| `embedded-captions` | `heygen-com/hyperframes` | **Sub.** Captions over an existing *talking-head* video: a verbatim "rail" with an embedded climax behind the subject, from a catalog of 35 styles. It transcribes and cuts out the subject locally. | `npx skills add heygen-com/hyperframes --skill embedded-captions` | It is designed for a single subject speaking to camera; multi-shot material must be split first. | ✅ [SKILL.md](https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/embedded-captions/SKILL.md) |
| `media-use` | `heygen-com/hyperframes` | **Other.** Resolves background music, SFX, image, logo, voice and color grading; it also does voiceover, transcription, captions and cuts/reframing. | `npx hyperframes media-use resolve --type … --intent …`. Uses the `heygen` CLI. | It depends on the HeyGen catalog and account. | ✅ [SKILL.md](https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/media-use/SKILL.md) |
| `captions-overlay` | `heygen-com/hyperframes` | **Sub.** Caption doctrine as an overlay (drop / rail / embed). | Marked `internal: true`. The README says the repo's internal skills are excluded by default. | It is not installable by default; skills.sh says "No SKILL.md available". | ✅ [SKILL.md](https://raw.githubusercontent.com/heygen-com/hyperframes/HEAD/.agents/skills/captions-overlay/SKILL.md), [skills.sh](https://skills.sh/heygen-com/hyperframes/captions-overlay) |
| `slideshow` | `heygen-com/hyperframes` | **Other.** Navigable deck with fragments. | `npx skills add heygen-com/hyperframes --skill slideshow` | **It does not produce a linear MP4**: the skill itself warns that `render` truncates it. | ✅ [SKILL.md](https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/slideshow/SKILL.md) |

### 2.3 Community (skills.sh and ClawHub, `community` trust in Hermes)

| Skill | Hub/repo | What it covers | How it is invoked | What it does NOT do | Source |
|---|---|---|---|---|---|
| `caption-animation` | skills.sh · `iart-ai/tiktok-video-skills` | **Sub, Dyn.** Whisper pipeline → `{text,startMs,endMs}` tokens → 1-4 word "pages" (`createTikTokStyleCaptions()`) → per-word pop and active-word highlight → 9:16 safe area → burned in or SRT/VTT. Rule: timing per word, never per line. | `npx skills add iart-ai/tiktok-video-skills` (or `--skill caption-animation`). Implementation in Remotion or CSS. | It does not transcribe by itself: it uses Whisper or AssemblyAI. | ✅ [SKILL.md](https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/caption-animation/SKILL.md), [skills.sh](https://skills.sh/iart-ai/tiktok-video-skills/caption-animation), [README](https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/README.md) |
| `short-form-video` | skills.sh · `iart-ai/tiktok-video-skills` | **Dyn.** Hook in ~1-3 s, one idea per video, pattern interrupts every ~2-4 s with irregular intervals, punch-in zoom as a cheap interrupt, loops (last frame = first) and 9:16 safe areas. Delivered in Remotion. | Same as above. | The retention figures it cites (e.g. "~87% decide in 3 s") have no primary source inside the skill. | ✅ [SKILL.md](https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/short-form-video/SKILL.md) |
| `lower-thirds`, `countdown-video` | skills.sh · `iart-ai/tiktok-video-skills` | **Data, Dyn.** Lower thirds with staggered entry and a template for several people. Frame-accurate counters, with digits that spin or flip. | Same as above. | They are generic, not sports-specific. | ✅ [lower-thirds](https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/lower-thirds/SKILL.md), [countdown](https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/countdown-video/SKILL.md) |
| `chart-animation` | skills.sh · `iart-ai/data-animation-skills` | **Data.** Bar chart race, animated lines, count-ups. All values come from `useCurrentFrame()`, and a template can be batch-rendered with N datasets. | `hermes skills install skills-sh/iart-ai/data-animation-skills/chart-animation` | It only makes the chart; it does not compose the full video. | ✅ [SKILL.md](https://raw.githubusercontent.com/iart-ai/data-animation-skills/HEAD/skills/chart-animation/SKILL.md) |
| `ffmpeg-captions-subtitles` | skills.sh · `josiahsiegel/claude-plugin-marketplace` | **Sub.** SRT/ASS/VTT burning, `force_style`, position, `drawtext`, Whisper in FFmpeg 8 with VAD, soft tracks in multiple languages. | `npx skills add https://github.com/josiahsiegel/claude-plugin-marketplace --skill ffmpeg-captions-subtitles` | It does not animate word by word (that is in the kinetic skills below). | ✅ [SKILL.md](https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-core/skills/ffmpeg-captions-subtitles/SKILL.md), [skills.sh](https://skills.sh/josiahsiegel/claude-plugin-marketplace/ffmpeg-captions-subtitles) |
| `ffmpeg-kinetic-captions`, `ffmpeg-karaoke-animated-text`, `viral-video-animated-captions` | same repo | **Sub, Dyn.** Karaoke with word-grow, CapCut-style pop and bounce, spring and shake, typewriter, timing profiles for TikTok and Shorts, and animated lower thirds, all with ASS tags and `drawtext`. | Same (`--skill <name>`). | Everything is FFmpeg/ASS: there is no interactive preview. | ✅ [kinetic](https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-effects/skills/ffmpeg-kinetic-captions/SKILL.md), [karaoke](https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-effects/skills/ffmpeg-karaoke-animated-text/SKILL.md), [viral captions](https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-social-video/skills/viral-video-animated-captions/SKILL.md) |
| `ffmpeg-transitions-effects` | same repo | **Tr, Dyn.** More than 40 `xfade` types, fades, wipes, slide/push, iris, multi-clip sequences, **slideshow from images** and **Ken Burns with `zoompan`**. | Same. | It is not a visual editor. | ✅ [SKILL.md](https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-effects/skills/ffmpeg-transitions-effects/SKILL.md) |
| `viral-video-short-form`, `viral-video-platform-specs` | same repo | **Dyn, Other.** Short-form strategy per platform (hooks, loops) and export specs and FFmpeg presets per platform. | Same. | The algorithm claims have no primary source inside the skill. | ✅ [short-form](https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/viral-video-master/skills/viral-video-short-form/SKILL.md), [specs](https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-social-video/skills/viral-video-platform-specs/SKILL.md) |
| `video-editing` | ClawHub and GitHub · `PrunaAI/pruna-skills` | **Sub, Tr, Data, Other.** Local post-production with FFmpeg on already rendered material: concat, crossfades, burned captions, title cards and lower thirds, background music, 9:16 export with loudness normalization. HyperFrames is optional. | `npx skills add PrunaAI/pruna-skills@video-editing -y`. On ClawHub the slug is ambiguous (two owners with the same name). | **It does not generate video** or write motion prompts. | ✅ [SKILL.md](https://raw.githubusercontent.com/PrunaAI/pruna-skills/HEAD/skills/guides/video-editing/SKILL.md) |
| `whisperx` | same repo | **Sub (input).** Word timestamps via Replicate (`victor-upmeet/whisperx`); writes JSON and SRT. | Same. Requires `REPLICATE_API_TOKEN`. | It is a paid remote service. | ✅ [SKILL.md](https://raw.githubusercontent.com/PrunaAI/pruna-skills/HEAD/skills/audio/whisperx/SKILL.md) |
| `illustrated-story-reel`, `visual-transition-reel` | ClawHub and GitHub · Pruna | **Tr, Dyn.** Narrated reel from images with Ken Burns (`ken_burns` mode: images + TTS, no video API) and an edit assembled locally with FFmpeg. `visual-transition-reel` makes transitions between generated shots. | `npx skills add PrunaAI/pruna-skills@<skill> -y` | It starts from **generated images** with paid APIs (Pruna/Replicate), not from your own photos. | ✅ [illustrated (ClawHub API)](https://clawhub.ai/api/v1/skills/illustrated-story-reel), [visual-transition-reel](https://raw.githubusercontent.com/PrunaAI/pruna-skills/HEAD/skills/workflows/visual-transition-reel/SKILL.md) |
| `wjs-burning-subtitles` | ClawHub · `@jianshuo` | **Sub.** Video + SRT → burned with libass or `mov_text` soft-mux. Mixes the dubbing with the original audio as background in a single encode. Checks first that FFmpeg has libass and calibrates `Fontsize` by extracting a frame. | `openclaw skills install @jianshuo/wjs-burning-subtitles` | It does not do kinetic or per-word captions (it points to another skill). | ✅ [ClawHub](https://clawhub.ai/jianshuo/skills/wjs-burning-subtitles) |
| `remotion-word-highlight-subtitles` | ClawHub | **Sub.** Highlights the current word by combining Whisper timestamps and Remotion rendering, on local short videos. | Through ClawHub. Requires python3, FFmpeg, whisper and node. | — | ✅ [ClawHub API](https://clawhub.ai/api/v1/skills/remotion-word-highlight-subtitles) |
| `beat-sync-video-editing` | skills.sh · `ecliptic-ai/skills` | **Dyn, Tr.** An "EditPlan" JSON (clips, audio) generated with Gemini, validated and rendered with FFmpeg `filter_complex`. | `gemini-edit-plan.sh` script. | It depends on Gemini and starts from a source video, not photos. | ✅ [SKILL.md](https://raw.githubusercontent.com/ecliptic-ai/skills/HEAD/plugins/ecliptic/skills/beat-sync-video-editing/SKILL.md) |
| `moviepy`, `ffmpeg` | skills.sh · `digitalsamba/claude-code-video-toolkit` | **Data, Other.** Deterministic overlaid text (labels, captions, lower thirds) with PIL and moviepy 2.x. FFmpeg to convert, trim, compress and extract audio. | Through skills.sh. | `ffmpeg` does not handle subtitles; `moviepy` does not do karaoke. | ✅ [moviepy](https://raw.githubusercontent.com/digitalsamba/claude-code-video-toolkit/HEAD/.claude/skills/moviepy/SKILL.md), [ffmpeg](https://raw.githubusercontent.com/digitalsamba/claude-code-video-toolkit/HEAD/.claude/skills/ffmpeg/SKILL.md) |

### 2.4 Seen in the index but not verified

- `openclaw/openclaw/video-frames` appears in the Hermes index (skills.sh source), but it does not appear in the current tree of the `openclaw/openclaw` repo. 🟡 LIKELY that it existed or moved — [skills.json](https://nousresearch.github.io/hermes-agent/docs/api/skills.json).
- ClawHub has dozens more skills with related descriptions (`tiktok-clipper`, `08-video-merge`, `chart-animation`, `byteplus-mediakit-video-highlights`…). I only opened the ones in the table. The rest remain 🟡 LIKELY based on their index description.

---

## 3. Gaps

| What the user asked for | Is there a skill? | Detail |
|---|---|---|
| Burned-in subtitles | ✅ Yes, several | There are three families: FFmpeg/ASS (`ffmpeg-captions-subtitles`, `wjs-burning-subtitles`), Remotion (`remotion-captions`, `caption-animation`) and HyperFrames (`hyperframes`, `embedded-captions`). |
| Karaoke / word by word in Spanish | ✅ Partial | The skills are language-agnostic. `hyperframes` explicitly warns against `.en` Whisper with non-English audio. ⛔ No skill is focused on Spanish. |
| Transitions between images or clips | ✅ Yes | `ffmpeg-transitions-effects` (xfade, slideshow, Ken Burns), HyperFrames shader transitions, `video-editing` crossfades. |
| Rhythm and dynamism ideas | ✅ As a guide | `short-form-video` and `viral-video-short-form` are craft guides. `beat-sync-video-editing` cuts to the beat, but requires Gemini and a source video. ⛔ There is no skill that decides rhythm from an **already recorded narration** without music. |
| Statistics overlays | ✅ Generic | Count-up, charts and lower thirds: `motion-graphics`, `chart-animation`, `lower-thirds`, `manim-video`'s "Data story" mode. ⛔ There is **no** skill for football scorelines, lineups, xG or tables. |
| Official generic FFmpeg skill in Hermes | ⛔ Not found | Among the hub's `built-in`/`official` skills there is none for general FFmpeg editing. You have to go to skills.sh or ClawHub. |
| Video skills in `anthropics/skills` | ⛔ Not found | The `skills/` folder contains algorithmic-art, canvas-design, slack-gif-creator, pptx, pdf, etc. None is for video. — [GitHub API](https://api.github.com/repos/anthropics/skills/contents/skills) |

---

## 4. Relevance for football Shorts with narration and photos

This section only reports; it does not propose implementing anything in this repo.

- **GoatLab's agent is OpenClaw, not Hermes.** The same skills can be installed from OpenClaw without going through Hermes: ClawHub with `openclaw skills install @owner/<slug>` and skills.sh with `skills-sh:owner/repo/slug`. The Hermes hub mainly serves as a **unified search engine**. ✅ [OpenClaw Skills](https://docs.openclaw.ai/tools/skills)
- **Two families fit "narration + photos".** The first is pure FFmpeg: slideshow with `xfade` and Ken Burns, plus ASS for captions. It only needs FFmpeg with libass, and `wjs-burning-subtitles` documents that Homebrew's FFmpeg sometimes comes without libass. The second is the HTML/React renderers: HyperFrames or Remotion, which add `motion-graphics`/`chart-animation` for figures, but require Node and headless Chrome.
- **Synchronized captions need word timestamps.** Every animated-caption skill asks for them (Whisper, WhisperX or `hyperframes transcribe`). With Spanish narration, avoid `.en` models.
- **For figures** (probabilities, form, H2H) the closest options are generic count-ups and charts. Any sports-specific overlay would have to be designed.
- **Trust:** almost everything useful is `community` in Hermes (scanned, but without Nous endorsement). Only `hyperframes`, `kanban-video-orchestrator`, `ai-presenter-video`, `brag`, `whisper` and the built-in `manim-video`/`ascii-video` are `official` or `builtin`.

---

## 5. URLs consulted (opened on 2026-09-27)

**Hermes Agent / Nous Research**
- https://github.com/NousResearch/hermes-agent
- https://hermes-agent.nousresearch.com/docs/skills
- https://hermes-agent.nousresearch.com/docs/user-guide/features/skills
- https://hermes-agent.nousresearch.com/docs/reference/optional-skills-catalog
- https://nousresearch.github.io/hermes-agent/docs/api/skills.json
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/hyperframes/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/kanban-video-orchestrator/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/ai-presenter-video/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/brag/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/mlops/whisper/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/skills/creative/manim-video/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/skills/creative/ascii-video/SKILL.md

**Standard and nearby registries**
- https://agentskills.io/
- https://docs.openclaw.ai/tools/skills
- https://api.github.com/repos/anthropics/skills/contents/skills
- https://clawhub.ai/jianshuo/skills/wjs-burning-subtitles
- https://clawhub.ai/api/v1/skills/illustrated-story-reel
- https://clawhub.ai/api/v1/skills/remotion-word-highlight-subtitles
- https://skills.sh/heygen-com/hyperframes/captions-overlay
- https://skills.sh/iart-ai/tiktok-video-skills/caption-animation
- https://skills.sh/josiahsiegel/claude-plugin-marketplace/ffmpeg-captions-subtitles

**Remotion**
- https://www.remotion.dev/docs/ai/skills
- https://raw.githubusercontent.com/remotion-dev/skills/main/skills/remotion-best-practices/SKILL.md
- https://raw.githubusercontent.com/remotion-dev/skills/main/skills/remotion-captions/SKILL.md
- https://raw.githubusercontent.com/remotion-dev/skills/main/skills/remotion-render/SKILL.md

**HeyGen HyperFrames**
- https://raw.githubusercontent.com/heygen-com/hyperframes/HEAD/README.md
- https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/motion-graphics/SKILL.md
- https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/embedded-captions/SKILL.md
- https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/media-use/SKILL.md
- https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/slideshow/SKILL.md
- https://raw.githubusercontent.com/heygen-com/hyperframes/HEAD/.agents/skills/captions-overlay/SKILL.md

**Community**
- https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/README.md
- https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/caption-animation/SKILL.md
- https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/short-form-video/SKILL.md
- https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/lower-thirds/SKILL.md
- https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/countdown-video/SKILL.md
- https://raw.githubusercontent.com/iart-ai/data-animation-skills/HEAD/skills/chart-animation/SKILL.md
- https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-core/skills/ffmpeg-captions-subtitles/SKILL.md
- https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-effects/skills/ffmpeg-kinetic-captions/SKILL.md
- https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-effects/skills/ffmpeg-karaoke-animated-text/SKILL.md
- https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-effects/skills/ffmpeg-transitions-effects/SKILL.md
- https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-social-video/skills/viral-video-animated-captions/SKILL.md
- https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-social-video/skills/viral-video-platform-specs/SKILL.md
- https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/viral-video-master/skills/viral-video-short-form/SKILL.md
- https://raw.githubusercontent.com/PrunaAI/pruna-skills/HEAD/skills/guides/video-editing/SKILL.md
- https://raw.githubusercontent.com/PrunaAI/pruna-skills/HEAD/skills/audio/whisperx/SKILL.md
- https://raw.githubusercontent.com/PrunaAI/pruna-skills/HEAD/skills/workflows/visual-transition-reel/SKILL.md
- https://raw.githubusercontent.com/ecliptic-ai/skills/HEAD/plugins/ecliptic/skills/beat-sync-video-editing/SKILL.md
- https://raw.githubusercontent.com/digitalsamba/claude-code-video-toolkit/HEAD/.claude/skills/moviepy/SKILL.md
- https://raw.githubusercontent.com/digitalsamba/claude-code-video-toolkit/HEAD/.claude/skills/ffmpeg/SKILL.md
