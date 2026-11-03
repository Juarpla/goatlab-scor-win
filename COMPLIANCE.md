# COMPLIANCE — GoatLab Shorts

Blocking pre-render rules. Lint (`pnpm lint:shorts`) fails the run if any rule is violated.

## Prohibited (zero tolerance)

1. **Broadcast footage**: only still photos with a registered license. Movement is a camera move over that photo, plus graphics and the site's own web card. No clips from a televised match.
2. **Logos drawn by GoatLab**: the template adds no crests, leagues or brands. The only logo it draws is GoatLab's (`public/favicon.svg`). The crest and sponsor already present in the player photo stay.
3. **Odds, betting houses and betting CTAs**: no odds/lines, picks, stake/bankroll, tipster, bonuses, casino, parlay/accumulator, handicap, "banker/sure thing".
4. **Result guarantees**: no "guaranteed win", "100% safe", "guaranteed".
5. **Raw market keys to the reader**: `1X2`, `BTTS`, `DNB`, `H2H`, `HT/FT` are never printed (see `src/lib/story-dictionary.js`).

## Probability gate

- `evaluation-report.json → published: false` ⇒ **zero `%` in scripts and descriptions**. Metrics only: form, goals, xG, head to head, declared samples.
- With `published: true`, percentages only from inputs that beat their baseline (same rule as the web verdict).

## Required in every delivery

- A beat with the web CTA (`goatlab.win`) inside the script.
- Description with: hook + analysis + `🔗 Más data: https://goatlab.win/partido/<id>` + `#goatlab` + fixed disclaimer:
  > Análisis con fines educativos e informativos. No es asesoría de apuestas y no garantiza resultados.
- Script in continuous text ≤ 110 words (~50s), ready to read aloud: hook + interwoven data + close + spoken CTA to `goatlab.win`. Agnes illustrations with provenance and the referential notice registered in `media-pack`.
- Click title different from the hook. It is stamped by `shortTitle`: row icon, `⚽` and the fixed phrase from the `writing-short-scripts` skill (teams, or up to two players from scripts 3, 4, 7 and 9). Hashtags with teams and players first, limit 15. Lint fails if the JSON does not match.

## Photos

Bank per match: four images and four reference Agnes clips. Images keep model, prompt, date and dimensions; public clips keep model, prompt/reference hashes and dimensions, while their task identifiers stay in private state. The ephemeral budget per run is 70 minutes, split across the pending matches and limited to kickoff + 24 h. SQLite is a cache; admission and quotas depend on `app-states/goatlab/agnes-state.json`, private in R2. Public reports are sanitized and do not include task identifiers, raw responses, credentials or signed URLs. Illustrations do not document real plays. Brand, music and own fonts keep their licenses. Graphic figures are resolved from the verifiable catalog; missing data is indicated without inventing zeros.

Complete v2 banks require coherent fingerprint and identity, four photos and four distinct clips and verified storage availability. Legacy banks remain readable and need verification before being declared complete. `_agnes-hourly.json` is telemetry, not a manifest. Pruning requires a verified final FT/AET/PEN and more than one hour since its first valid detection; it applies to scripts, prompts, media, analysis and probabilities. Media additionally requires a shared close and confirmed remote deletion before deleting locally. Results and historical evaluation are outside this pruning.

## Video

`pnpm short -- --match=<webId> --audio=<file>`: H.264/AAC MP4 1080×1920 at 30 fps. React/Remotion interprets the validated voice plan, combining images, muted clips and statistical graphics. It keeps yellow subtitles with a black outline, music and the goatlab.win endcard. Maximum 49.9 seconds and less than 45 MB; voice up to 45.9 s, maximum acceleration 1.10 preserving pitch and all words. Transcription uses the adjusted audio. Renders in public/shorts/ (gitignored).
