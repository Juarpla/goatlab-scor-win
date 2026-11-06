# COMPLIANCE — GoatLab Shorts

Editorial and provenance requirements. `pnpm lint:shorts` checks the stored
scripts and media manifests; render validation and visual review cover the MP4.
The linter does not inspect JSX, framing or the finished video.

## Prohibited (zero tolerance)

1. **Broadcast footage**: no clips from televised matches. Use licensed stills or referential Agnes images and animated clips with the provenance recorded in the media pack. Generated animation is permitted; it is not footage of a real play.
2. **Logos drawn by GoatLab**: the authored composition adds no team crests, league logos or third-party brands. The final logo uses the asset specified in the [brand reference](.agents/skills/video-render/references/brand.md). The crest and sponsor already present in the player photo stay.
3. **Odds, betting houses and betting CTAs**: no odds/lines, picks, stake/bankroll, tipster, bonuses, casino, parlay/accumulator, handicap, "banker/sure thing".
4. **Result guarantees**: no "guaranteed win", "100% safe", "guaranteed".
5. **Raw market keys to the reader**: `1X2`, `BTTS`, `DNB`, `H2H`, `HT/FT` are never printed (see `src/lib/story-dictionary.js`).

## Probability gate

- `evaluation-report.json → published: false` ⇒ **zero `%` in scripts and descriptions**. Metrics only: form, goals, xG, head to head, declared samples.
- With `published: true`, percentages only from inputs that beat their baseline (same rule as the web verdict).

## Required in every delivery

- A beat with the web CTA (`goatlab.win`) inside the script.
- Description with icons only on the lede, link and disclaimer: `⚽` lede + `📊` link block (`📊 Todos los datos del partido:` on one line, `https://goatlab.win/partido/<id>` on the next) + `⚠️` fixed disclaimer + `©️` credits when present + hashtags (including `#goatlab`) as the last block, without icon, separated by blank lines:
  > Análisis con fines educativos e informativos. No es asesoría de apuestas y no garantiza resultados.
- Script as labeled spoken beats under the [writing skill](.agents/skills/writing-short-scripts/SKILL.md), joined into continuous narration for recording, ≤110 words with a target below 50 s. Include the spoken CTA to `goatlab.win`. Agnes illustrations with provenance and the referential notice registered in `media-pack`.
- Click title different from the hook. It is stamped by `shortTitle`: row icon, `⚽` and the fixed phrase from the `writing-short-scripts` skill (teams, or up to two players from scripts 3, 4, 7 and 9). Hashtags without accents and without duplicates, teams and players first, limit 15. Lint fails if the JSON does not match.

## Photos

Bank per match: four images and four reference Agnes clips. Images keep model, prompt, date and dimensions; public clips keep model, prompt/reference hashes and dimensions, while their task identifiers stay in private state. The ephemeral budget per run is 70 minutes, split across the pending matches and limited to kickoff + 24 h. SQLite is a cache; admission and quotas depend on `app-states/goatlab/agnes-state.json`, private in R2. Public reports are sanitized and do not include task identifiers, raw responses, credentials or signed URLs. Illustrations do not document real plays. Brand, music and own fonts keep their licenses. Graphic figures are resolved from the verifiable catalog; missing data is indicated without inventing zeros.

Complete v2 banks require coherent fingerprint and identity, four photos and four distinct clips and verified storage availability. Legacy banks remain readable and need verification before being declared complete. `_agnes-hourly.json` is telemetry, not a manifest. Pruning requires a verified final FT/AET/PEN and more than one hour since its first valid detection; it applies to scripts, prompts, media, analysis and probabilities. Media additionally requires a shared close and confirmed remote deletion before deleting locally. Results and historical evaluation are outside this pruning.

## Video

The local CLI is `node --env-file=.env video-render/cli/render.mjs`, with the
match, script and version 5 JSX plan. Follow the
[render workflow](.agents/skills/video-render/SKILL.md) for recording and delivery.

The implemented format/voice contract is
[short-format.js](video-render/contract/short-format.js): 1080×1920, 30 fps,
H.264/AAC, at most 55 s including the one-second authored-plan endcard, and a
53 s voice budget. Voice adjustment preserves pitch and words, up to 1.10×
(input at most 58.3 s). The final file must be smaller than 45 MB.
Transcription uses the adjusted audio.

Inputs and outputs follow [layout.js](video-render/contract/layout.js): recordings
in `video-render/audios/<id>/`, delivered MP4s in `video-render/videos/<id>/`, and
plans/QA in `video-render/work/<id>/`. `public/shorts/` is not a delivery path.

Final-video aesthetics are governed only by the
[creative direction](.agents/skills/video-render/references/creative.md), with
fixed identity in [brand.md](.agents/skills/video-render/references/brand.md).
These editorial/provenance requirements still apply to all on-screen claims.
