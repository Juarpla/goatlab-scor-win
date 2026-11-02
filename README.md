# GoatLab

Football analytics in Spanish for Latin America. Astro, GitHub Actions and Cloudflare Pages.

## Status

Database and AI are implemented; the custom interface is pending the visual choice opened in Impeccable. No credentials are configured and no predictions are validated. The initial JSON files represent unavailable data, not invented matches.

## Development

Node 22.12 or later.

```sh
pnpm install
pnpm run dev -- --background
pnpm run astro -- dev status
pnpm run astro -- dev logs
pnpm run astro -- dev stop
node --test tests/*.test.js
pnpm run build
```

## Data and analysis

`node actions/1-update-data/update-data.mjs` builds a seven-day window by merging two free providers: Football-Data.org serves any range in one request; API-Football (free plan limited to yesterday through tomorrow) is the authority for those dates and provides the score with minute. `--refresh` updates only the day's scorelines. Recent form is computed against a local results base (`public/data/results.json`): an initial per-competition fill from Football-Data.org plus yesterday's results, deduplicated tolerantly across provider name differences. Bzzoiro (free REST) provides statistics with xG and incidents for the day's matches, with name matching and a bounded budget. Missing metrics stay missing (`null`), never an invented zero.

The team dictionary (`public/data/teams.json`, 129 active teams for 2026/27 plus Libertadores 2026) assigns each club its web slug plus the Bzzoiro, API-Football (2024 roster as a bridge, `bridged:true`; the free plan blocks the current season) and Football-Data.org ids; it is built with `pnpm run data:teams` and match URLs use `home-vs-away-date`. Old fixture ids (`af-`/`fd-`) still resolve.

The Actions flow runs at 06:05 UTC (full run: window, form, analysis; 01:05 Lima) and every six hours (scorelines only), plus manual runs and changes to `main`. This interval **is not a live stream**. Minute-by-minute tracking was out of scope: there is no free real-time source; the Bzzoiro WebSocket (ball coordinates) costs USD 3/month.

Keys are configured as GitHub Secrets with the names from `.env.example`; they must not reach the browser. Model configuration uses repository variables. OpenCode Go is designed for coding-agent traffic according to its documentation: confirm that the account allows this editorial use before enabling that provider. No other client is impersonated.

Analysis is prepared for every active match in the seven-day window, cached by `inputKey`: a match with no changes is not paid for again. Existing analyses and probabilities are kept for more than one hour after the first valid detection of FT/AET/PEN with both scorelines. During that grace period the content is kept without recalculation; disappearing from the calendar or leaving the top does not authorize deleting it. It is preserved between runs through Actions artifacts; it is not generated per visitor. If only the calendar is available, the prompt requires describing only that context. An LLM outage does not block sports data.

The Poisson engine is an isolated experimental base. It is not connected to public percentages without historical evaluation. The initial gate requires at least 200 evaluation matches and a Brier score better than the baseline; this does not replace a calibration, segmentation and data-quality review before production.

## Publishing to Cloudflare Pages

Create a Direct Upload Pages project and configure in GitHub:

- Secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, with limited Pages publishing permissions.
- Variable `CLOUDFLARE_PAGES_PROJECT`, with the real project name.
- Secrets for the sports APIs and LLM providers that will be used.

The workflow runs tests, prepares data, builds Astro and publishes `dist` through Wrangler. Without a project name, it skips publishing. No external deployment has been executed.

AdSense is pending implementation; no ads or trackers are loaded. Placements will be prepared before configuring identifiers from an approved account.

## References

- [API-Football: plans and seasons](https://www.api-football.com/pricing)
- [Football-Data.org: limits and delay](https://www.football-data.org/pricing)
- [Mistral: Chat Completions](https://docs.mistral.ai/api)
- [Workers AI: compatible API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/)
- [OpenCode Go: endpoints and usage](https://opencode.ai/docs/go/)

Product decisions are in PRODUCT.md. The design will be built directly in code, following `.impeccable/config.json`.


### Audiovisual content

`pnpm content` prepares scripts and prompts for the configurable top 5. It accepts
`--category=all|scripts|image-prompts`, `--match=<webId>`, `--top=N` and `--force`.
Categories are saved independently and preserve existing valid content. Both
locally and in GitHub Actions, the priority is DeepSeek V4.1 Flash → GLM-5.3-Flash
→ Mistral → Workers AI, configured by `SCRIPT_PROVIDER_ORDER`, independent of
sports analysis. DeepSeek and GLM use `max` reasoning, up to 131072 tokens and 10
minutes per attempt. The ten scripts keep their topics and 55 to 100 words
(ceiling 110); the model writes freely and stores its future scenario in
`projection`, identified as opinion in the narration. Historical figures still
come from the data. Motion Prompts was retired; graphics receive the fact catalog
directly.

To measure latency and validate drafts without publishing them:
`node --env-file=.env scripts/benchmark-content-llm.mjs --match=<webId> --runs=2`.
Results and texts are saved in `.cache/content-llm-benchmark/`.

Each match has `/scripts` and `/image-prompts`
with their `.json` equivalent; `/content-index.json` lists the scripts available
for upcoming matches. The shared bank of 4 images and up to 4 Agnes clips is
produced by GitHub Actions. The render is local: it consumes the bank, the voice
and the script, and delivers the 1080x1920 MP4 without depending on a server.

Install the render dependencies with
`npm ci --prefix video-render/render/remotion` and run:

```sh
node --env-file=.env scripts/render-short.mjs --match=<webId> --audio=<file> \
  --script=<scripts.json> [--script-n=<n>] --plan=<plan.json>
```

Transcription uses Mistral and Whisper; with `--script`, the script is aligned to
fix names and figures without losing per-word timings. The version 5 plan is
original JSX per audio and can combine typography, SVG, overlays, cards, photos
and clips. Versions 1 to 4 keep their compatibility path. The endcard shows the
logo for one second and the total, including that endcard, measures at most 55 s.
Recording recommendation: up to 50 s; technical voice budget 53 s and adjustment
up to 1.10 preserving pitch. MP4s are saved in `video-render/videos/` and working
files in `video-render/work/`.
See [the creative freedom and constraints report](CREATIVE-FREEDOM-REPORT.md).

The five Agnes Video Flash attempts pair different prompts and images before
reusing them. An uncertain task with an identifier has up to 60 s of recovery from
errors per run; without an identifier, the partial edit continues immediately.
Uncertain attempts are not repeated and a 429 keeps the pair while respecting
Retry-After within the run budget.


Agnes admission and quotas are shared through a private JSON file in R2; SQLite
remains a cache. Actions queries R2 directly and does not start servers. Daily
media retries run at 02:15, 04:15 and 06:15 Lima. A complete bank avoids
installing pnpm, Python and ffmpeg; maintenance still runs. Every complete v2 bank
has four images and four distinct clips, coherent identity/fingerprint and
verified availability in R2. Drafts publish only the new complete manifests; they
preserve the previous complete one if the retry is partial. Progress and reports
are published separately.

To configure credentials, perform the coordinated cutover, check CAS or
recover/retire producers, follow [AGNES-STATE.md](AGNES-STATE.md). Continuity uses
the files published in R2 and the private JSON; temporary files are deleted after
confirming the upload. A consumed generation lost without a recoverable
identifier keeps the lock and may leave the bank partial.

Clips use the fixed phrase «Animate this image with fast, precise, hyperrealistic movements.»
from `src/lib/video-animation.json`, synchronized with the portable consumer. No
Video Prompts documents or pages of that category are generated. Agnes receives
the image as `first_frame` in `keyframe` mode, six seconds, 720P and 9:16.
Reservations and accepted tasks keep their original hashes to recover and reuse
previous clips without repeating POST. The v3 fingerprint includes the fixed
policy and the images; a previous inventory is re-verified before publishing the
new fingerprint.
