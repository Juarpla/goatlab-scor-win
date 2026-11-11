---
name: GoatLab
description: Dark visual system for reading football through comparable data.
colors:
  deep-carbon: "#101412"
  matte-surface: "#181e1a"
  raised-surface: "#222a24"
  lime-signal: "#c5ed74"
  slate-blue: "#8ca6bf"
  warm-ink: "#edf0e6"
  quiet-ink: "#a4aea3"
  rule: "#354035"
  form-win: "#29351d"
  form-draw: "#303732"
  form-loss: "#3b2824"
  series-draw: "#6f8173"
  series-muted: "#55645a"
  yellow-card: "#e9c46a"
typography:
  display:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "clamp(3rem, 7vw, 5.125rem)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "clamp(2.25rem, 4vw, 4rem)"
    fontWeight: 600
    lineHeight: 1.03
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.08em"
rounded:
  sm: "5px"
  md: "12px"
spacing:
  xs: "5px"
  sm: "12px"
  md: "22px"
  lg: "48px"
components:
  button-primary:
    backgroundColor: "{colors.lime-signal}"
    textColor: "{colors.deep-carbon}"
    rounded: "{rounded.sm}"
    padding: "12px 18px"
    height: "48px"
  button-filter-active:
    backgroundColor: "{colors.lime-signal}"
    textColor: "{colors.deep-carbon}"
    rounded: "6px"
    padding: "9px 12px"
    height: "40px"
  field-search:
    backgroundColor: "{colors.deep-carbon}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 0"
  team-logo:
    hotlink: "https://sports.bzzoiro.com/img/team/{id}/?bg=transparent"
    fallback: "initials monogram in Barlow Condensed on the local surface"
    size: "28px on cards; 30px in the match header"
  match-card:
    backgroundColor: "{colors.matte-surface}"
    rounded: "12px"
    padding: "18px 20px"
    grid: "CSS masonry (columns) in the home page wall"
    content: "competition chip · local kickoff time · crests · G/E/P (win/draw/loss) form · venue or competition"
  hero-band:
    slides: "maximum 3, real figures from the database; 12s CSS rotation; first slide static with reduced-motion"
    figure: "Barlow Condensed 700 in signal lime, tabular-nums"
  form-chip:
    backgroundColor: "{colors.form-win} | {colors.form-draw} | {colors.form-loss} depending on G/E/P"
    textColor: "#d2eea7 | #c7cfc6 | #e9b4a3 in the scoreline; opponent note in {colors.quiet-ink}"
    rounded: "6px"
    padding: "8px 8px 7px"
  form-strip:
    layout: "dynamic inline SVG (no static stroke): one row per team, one gap per match with scoreline and abbreviated opponent; fixed 5-slot grid with the most recent on the right; empty slot dotted. With no recorded series, the row falls back to a blueprint under construction (dashed scaffold, line drawing in a loop, nodes, label «En un futuro tendremos datos» (In the future we will have data)) with real crumbs underneath and an honest expectation"
    colors: "the G/E/P inks of form-chip; lime dot for home and slate blue for away; the blueprint uses neutral slate blue"
    a11y: 'role="img" with the series enumerated; per-match tooltip with scoreline, opponent and date; the empty row is announced as «sin serie registrada, en un futuro tendremos datos» (no recorded series, in the future we will have data); reduced motion leaves the blueprint static'
  map-pin:
    backgroundColor: "{colors.slate-blue} at rest; {colors.lime-signal} active or live"
    size: "9px dot on a 30px touch button"
  ticker:
    motion: "46s linear CSS loop, duplicated content aria-hidden; static row with reduced-motion"
  verdict-bars:
    track: "12px with a 1px rule and lime fill; condensed label and tabular value"
    weight-bar: "5px lime mini bar per declared input"
  reading-card:
    backgroundColor: "{colors.matte-surface}"
    rounded: "12px"
    padding: "24px 26px; 30px 34px the wide card"
    grid: "first section full width with a 148px scene; the rest in two columns; one column ≤1150px"
    scene: "flat SVG per kind (panorama · modelos · historial · tabla · goleadores · forma · claves), 1.7 stroke and one lime ball; drawn once on entry"
  reading-figure:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "clamp(1.875rem, 3vw, 2.375rem)"
    fontWeight: 700
    textColor: "{colors.warm-ink}; the first figure of each card in {colors.lime-signal}"
    note: "only figures that the section declares and its text contains; decimals with a decimal comma; tabular-nums"

---

# Design System: GoatLab

## Overview

**Creative North Star: “La sala de análisis” (The analysis room)**

GoatLab behaves like a video analysis station: the screen is matte, data has scale, and each chapter makes clear what is known. The interface uses a carbon green base, ivory text and lime or slate blue signals to distinguish teams and states.

Density changes with the narrative. A large chart opens the reading; tables and short notes ground the figure; an advertising pause occupies a reserved space outside the analysis area. The system stays legible when it collapses to a single column on mobile.

**Key Characteristics:**

- Comparable data with stable axes and scales.
- Condensed typography for headlines and Manrope for reading and controls.
- Flat tonal layers, thin rules and a sparse lime signal.
- Motion concentrated in the chapter change and the analysis scroll.

## Colors

The palette relies on a greenish carbon and a warm ink, with lime for action or selection and slate blue for the second data series.

### Primary

- **Signal lime** (#c5ed74): primary action, active selection and the home series of the chart.

### Secondary

- **Slate blue** (#8ca6bf): second data series and comparable states.

### Neutral

- **Deep carbon** (#101412): background of the whole application and text over the signal lime.
- **Matte surface** (#181e1a): data panels, charts and highlighted blocks.
- **Raised surface** (#222a24): inactive filter states and internal groupings.
- **Warm ink** (#edf0e6): headlines, team names and main figures.
- **Quiet ink** (#a4aea3): notes, metadata and secondary explanations.
- **Rule** (#354035): dividers, axes and field borders.

**The Signal Rule.** Lime appears in actions, selection and one data series; it never paints a whole section.

**The Verdict Tint Rule.** G/E/P results use three dedicated inks (green #29351d on text #d2eea7, grey #303732 on #c7cfc6, red #3b2824 on #e9b4a3) in the shape of cards and chips; they never replace the primary signals nor paint full surfaces.

## Typography

**Display Font:** Barlow Condensed (with sans-serif)

**Body Font:** Manrope Variable (with sans-serif)

**Label/Mono Font:** Manrope Variable with tabular numerals for measurements.

**Character:** Barlow Condensed gives match names the pulse of a broadcast; Manrope keeps notes and controls calm and precise.

### Hierarchy

- **Display** (700, `clamp(3rem, 7vw, 5.125rem)`, 0.95): home page thesis and editorial closing.
- **Headline** (600, `clamp(2.25rem, 4vw, 4rem)`, 1.03): fixture and chapter titles.
- **Title** (650, 1rem, 1.3): chart titles and reading blocks.
- **Body** (400, 0.9375rem, 1.6): context, methodology and notes; kept at comfortable reading measures.
- **Label** (600, 0.6875rem, 0.08em): competition, source, state and auxiliary actions.

**The Two Voices Rule.** Barlow Condensed names the game; Manrope explains what it means. Do not swap them for decoration.

## Layout

The maximum container is 1360px with 48px side margin on desktop and 22px on mobile. The home page opens with a thesis aligned to a side note, then a filter bar, a featured fixture in two columns and a list of fixtures. The analysis splits notes and graphic stage: the note advances by chapters and the stage stays fixed while there is space.

Below 1150px the density of the list is reduced; below 760px everything becomes one column, the filters scroll horizontally and the analysis stage becomes the top block. Navigation is reduced to essential actions. Rhythm uses 12, 22, 32, 48 and 70px according to the block scale.

## Elevation & Depth

Depth is built with tonal layers and 1px rules. There are no decorative shadows: a data panel is recognised by its matte surface and its separation. The only additional elevation is the chart block against the background.

**The Matte Surface Rule.** Surfaces stay opaque and quiet; motion belongs to the active chapter, not to a glass effect.

## Shapes

Action controls have contained 5px corners. Reading and chart panels use 12px to mark a complete set. Rules are thin and straight; no thick side borders are used on cards or notices. State labels may use a small pill, never a shape that competes with the data.

## Components

### Buttons

- **Shape:** contained corners (5px).
- **Primary:** signal lime on carbon, 48px high and `12px 18px` internal spacing.
- **Hover / Focus:** lightened lime on hover; visible 2px lime focus with 5px offset.
- **Secondary:** quiet text on transparent background; selection uses raised surface or lime depending on its function.

### Chips

- **Style:** small text, transparent background and minimal rules.
- **Shape:** 6px for competition filters; action controls keep 5px.
- **State:** the active filter uses lime and carbon text; the rest stay quiet until interaction.

### Cards / Containers

- **Corner Style:** 12px for stages and panels; 5px for controls.
- **Background:** matte surface on deep carbon.
- **Shadow Strategy:** tonal layers; no shadow at rest.
- **Border:** 1px rule when a block needs separation.
- **Internal Padding:** 25–36px in panels; 18–22px on mobile.

### Inputs / Fields

- **Style:** field without a bright box, warm text and a 1px rule below.
- **Focus:** visible lime outline and lime caret.
- **Error / Disabled:** quiet text and a recovery message; never hide an empty data state.

### Navigation

Navigation uses small Manrope, quiet text and wide separation. Links stay visible on desktop; on mobile only the home and the analysis exploration remain.

### Chapter Stage

The chapter stage is the distinctive component: top controls, a chart that changes shape completely and a source line in the footer. The active chapter always has a keyboard alternative and the content stays available with reduced motion.

### Home page components (2026-09 extension)

The home page adds five blocks inside the same world:

- **Hero with rotating band:** the editorial thesis on the left and a matte band on the right with up to three real figures from the database (results, matches in the window, head-to-head meetings) that rotate with CSS. With `prefers-reduced-motion` the band shows the first figure statically.
- **Window ticker:** a 1px rule strip with the week's fixtures (competition chip, abbreviated teams, local time) in a linear loop; decorative (`aria-hidden`) and static with reduced motion.
- **Featured form:** two-column panel with the priority fixture; the comparison of real goals is revealed upwards (`clip-path`) when it enters the viewport, once.
- **Reading path:** three numbered stops (form, numbers, limits) joined by separators; they are not cards.
- **Fixture wall:** masonry of cards with a crest by hotlink and a fallback monogram, G/E/P form on both sides and local time. Filters and search live in `/encuentros/`.

### Fixture wall (/encuentros, 2026-09 extension)

- **Row of 3:** on desktop the first three visible fixtures live in a full-width row (3 tracks `minmax(0,1fr)`) above the wall; the card anatomy does not fit in ~200px tracks, so on tablet and mobile the row does not exist and everything goes to the masonry (JS redistributes; without JS nothing disappears).
- **Reserved ads:** on desktop the 2-column masonry is flanked by two 300×600 vertical ads (`AdSlot variant="vertical"`) that follow the scroll with `position:sticky` (`top:24px`): their travel starts and ends inside the wall grid, so they stop where the cards end, without reaching the horizontal ad. Tablet shows only the final horizontal; mobile adds a horizontal below the filters. Reserved heights: no layout shift, ready for the real AdSense snippet. With a filter of ≤3 results the rails are removed (`.wall-body.is-thin`): a 600px rail does not dominate an almost empty view.
- **Wall pagination:** the wall opens with ~3 rows (9 cards on desktop counting the row of 3; 6 on tablet/mobile) and a discreet «Mostrar N más» (Show N more) button (`.wall-more` vocabulary) loads 3 more rows per click (6 cards on desktop/tablet, 3 on mobile). The ladder only animates new arrivals; the count lives in the existing `aria-live` and without JS the full wall stays visible.
- **Expiry rule:** a match leaves the wall (and the JSON in data runs) once it reaches 90' of play + 15' half-time + 10' fixed from kickoff; there is no filter for finished matches or past matches on the page.
- **Authorial moment:** when any filter changes, the visible cards re-enter in a ladder (14px rise, exponential ease-out, 45ms per card, cap 10); lime dot with a 1.8s pulse next to «EN VIVO» (LIVE) (the same language as the live pin). Both silenced with `prefers-reduced-motion`.

### Matchday region (Phase 2 extension, 2026-09)

A single block between the ads, with four pieces from the same world:

- **Venue map:** equirectangular grid of land dots (PNG generated from Natural Earth, public domain, background identical to the matte surface) with one pin per city: slate blue at rest, lime with a 1.8s blink when there is a live match (kickoff window → +1 h 50 min, "est." minute calculated on the client). Each pin opens a raised card with stadium, declared capacity and times; fixtures without a resolved venue drop to a text row below the map, they never disappear. When the map enters view, the viewport fits all mapped venues. Zoom controls and dragging adjust the view, and «Ver todas las sedes» restores the fit. With `prefers-reduced-motion`, zoom changes are instant and the live pin becomes solid lime.
- **Database pulse:** ledger of up to 4 real milestones (current streak, most goals, thrashing, team of the moment) in rows with a lime rank; never hero figure cards.
- **The names that count:** the same ledger in a players version: top scorer, assist leader and the most efficient (goals per match, without repeating the top scorer) across the covered leagues, with club and competition in the detail; only leaders that the source delivered.
- **Live table:** top-10 per competition with filter tabs; only tables that the provider delivered are shown and, if none arrived, an honest empty state with the next action.
- **Thermometer:** the hero rotating band, in panel version, with three real figures from the last 60 days.

**The Micro-Label Ramp Rule.** Labels and metadata use a fine 9–13px scale (10px for panel notes, 11px for footers, 12–13px for metadata and controls) always in Manrope with tabular numerals; Barlow Condensed is reserved for names and figures of 16px and above.

### Verdict (match page)

The verdict chapter shows each input with its weight in a lime mini bar and explains absences. Probability bars (1X2 and binary markets) only carry percentages when the published historical evaluation exceeds its reference; without it, the panel shows «Evaluación en curso» (Evaluation in progress), the qualitative direction of the inputs and the short-sample caveat. Home advantage and absences accompany as text, never as a number.

### Contact and promotional close (2026-09 extension)

The contact page abandons static `prose` and enters the system narrative:

- **Contact scrollytelling:** the reused `.story` grid with two chapters (bug report and betting exclusion) and a sticky stage that changes scene per chapter without tabs; activation follows the match page marker and layers cross with the 240/420ms vocabulary. Each scene's strokes draw in order on activation (staggered `pathLength`). With `prefers-reduced-motion` the exchange is instant and the stage stops being sticky; without JS the text stays complete and the first chart visible. At ≤760px the stage disappears and each chapter carries its scene inline, with strokes already resolved.
- **Contact scenes (`ContactScene.astro`):** decorative illustrations of reporting an error and the betting exclusion, with sparse lime as the main signal and slate blue as the secondary color. Both are hidden from assistive technology.
- **Closing slide (`PromoSlide.astro`):** GoatLab self-promotion, not AdSense inventory: it carries the label PUBLICIDAD (ADVERTISING) outside; no disguise as a third-party ad. Matte surface with a 1px rule and 12px radius; two-voice headline with the second line in lime following the hero band precedent; primary button to `/encuentros/`; permanent betting-house exclusion note. On mobile it stacks with the CTA full width.
- **AdSense:** the horizontal slot (`contactoCierre` in `src/config/ads.ts`) sits at the end of the narrative column, before the closing slide.
- **Phone mockup:** decorative SVG (`aria-hidden`) with a schematic product UI: form chips with the three verdict inks and the probability bar that fills once on entering the viewport (`js-anim` + `in-view`); no invented scorelines, names or figures.

### Match page (2026-09 extension, third pass: the narrative in 5 chapters)

The story goes from 4 fixed chapters to **5 dynamic chapters**: the skeleton (arrival + verdict) is always there; result, goals and first goal only appear with data in the JSON, and the predicted numbers live inside the verdict. Chapter 1 always shows the last 5 per team (the head-to-head history only lives in the JSON and the verdict, never in the chart) and the LLM audit (`llmReview`) lives only in the JSON, never in the view. The headlines are two-line fan questions, without acronyms: «Así llegan. / Lo que ya jugaron.» (This is how they arrive. / What they already played.) · «Quién se lo lleva. / El resultado, en 100 partidos.» (Who takes it. / The result, in 100 matches.) · «Cuántos goles. / El partido, en el marcador.» (How many goals. / The match, in the scoreline.) · «El primer gol. / Cuándo cae y quién lo mete.» (The first goal. / When it falls and who scores it.) · «El veredicto. / Con sus pesos a la vista.» (The verdict. / With its weights in view.)

- **Narrative dictionary (`src/lib/story-dictionary.js`):** raw keys (`1X2`, `BTTS`, `DNB`, `H2H`) are never printed; each chapter uses an everyday term first and the acronym in parentheses only the first time, with a native hint «¿qué significa esto?» (`details.meaning`, Manrope 11px over a 1px rule) per chapter.
- **Chapter 1 — what they already played:** the table and the chart always show the last 5 real matches per team, before the fixture. Priority source: `match.lastMatches` baked by the pipeline (Bzzoiro, last 5 finished per team before kickoff); if missing, `teamForm` over `results.json`; if nothing, honest absence. It paints from 1 match per side; the side without a recorded series shows the blueprint under construction with its crumbs (competition·date, table rescued by `teamId`, top scorer if it has no card in notes, `src/lib/series-crumbs.js`; whatever is missing is omitted silently) and the expectation «Sus últimos 5 aparecerán aquí…» (Their last 5 will appear here…). The chart (`FormStrip.astro`, see `form-strip`) is dynamic SVG generated from the data: one row per team with one gap per match (scoreline + abbreviated opponent, G/E/P inks), fixed 5-slot grid with the most recent on the right and dotted empty slots; `role="img"` with the series enumerated. Team signals live in the notes column under the lead «Últimos 5 en su campeonato» (Last 5 in their league): streak, clean sheet and biggest margin are calculated over the last 5 in the team's domestic league (first competition in tables that contains it and is not a cup; if there are fewer than 5 the real sample n/5 is declared; with no prior at all it paints «0 partidos jugados» (0 matches played) as debut), and the table and season goals card uses that same league when it resolves.
- **Chapter 2 — result waffle (`WaffleResult.astro`):** 100 small squares (10×10, 4px radius) that distribute the imaginary matches with the 1X2 tones; they bloom in a ladder on activation (`.pt-fade` with `--d` of 6ms per cell) and the legend counts «N de 100» (N of 100). It is the only chart in the stage in this chapter: the λ band («Lo que espera el cálculo»: home/away λ with a decimal comma + analysed matches) with its `.pt-grow-x` meters, the double chance in rows and the provider as a **side reading** in text («La otra lectura (Bzzoiro): …») (The other reading (Bzzoiro): …) move down to the notes column, below the text and before «¿qué significa esto?».
- **Chapter 3 — ladder and podium (`GoalsLadder.astro`, `ScorePodium.astro`):** the total ladder stacks 1.5/2.5/3.5 with a stepped start, the "yes" bar in lime with staggered `.pt-grow-x` and the "no" as text («que sea probable pasar de 1.5 no dice nada de llegar a 3.5»: that it is likely to go over 1.5 says nothing about reaching 3.5); it is the protagonist of the stage. The podium orders the 3 exact scorelines in lime/`#6f8173`/`#55645a` columns that grow (`.pt-grow`) with a 21px Barlow figure and the rest in a discreet line, and lives in the notes column together with the clean-sheet cards, «¿marcan los dos?» (`ProbabilityBar`) (do both score?), the context markets and the provider xG as a side reading.
- **Chapter 4 — first goal and names:** the six-leg race keeps its geometry and its bars now grow (`.pt-grow` staggered per leg); «se queda en cero» (it stays at zero) replaces «sin goles» (no goals) and the race is the only chart in the stage. The legs and scorers use λ blend (home Poisson + Bzzoiro xG in equal parts when both exist; provenance `Blend Poisson+xG` in the JSON and in the note). The scorers live in the notes column as a 100% split among the 5 favourites to open the scoreline (main figure; season goals as secondary), with a footer note on the context left out of the row (zero + rest); the bar carries its team's tone (home lime, away slate). Name cascade: league leaderboard → Bzzoiro squad (`scorer-fallback.json`, cap `SCORER_FALLBACK_MAX`) → AF topscorers (behind the `AF_TOPSCORERS=1` flag) → split by team with the same Poisson (Level 4, without inventing names); `scorerSource`/`fallbackSource` in the JSON declare the level used.
- **Verdict with numbers (`RadarDuel.astro`, fifth pass):** the verdict chapter opens with the expected table, the 9 figures (possession, shots, shots on target, xG, corners, fouls, yellows, reds, offsides) with the rhythm model `stats-ratings-v1` (`src/lib/stats-forecast.js`: own average + what the opponent concedes, shrunk to the competition mean, minimum 3 matches per side and metric; nulls are painted `—`) and below, in the notes column, the duels in `ProbabilityBar` («Quién saca más córners», «Primero a 3/5/7», «Por cuántos córners» (5 bands), «Quién ve más tarjetas» and «Quién cierra el marcador») (who takes more corners, first to 3/5/7, by how many corners, who sees more cards, who closes the scoreline) plus the **dominance radar** under the data: dynamic SVG with one polygon per team (home lime, away slate) over distribution axes with published evaluation, 1px grid, 11px Manrope labels with the value in a tspan, reused legend (`.legend`) and an `sr-only` table; it blooms with `.pt-fade` staggered via `.notes-visuals.is-in`. Then comes the input table with its weights and the verdict 1X2 bars, which keep the stage. Publication rule: expected values always with a declared sample; duel percentages only when their input exceeds its reference (stats: sample ≥ 30 and MAE better than the competition mean; last goal: Poisson gate). The corner race inherits the evaluation of corner rhythms (corner timing does not exist in any provider). Without `statsForecast` the numbers block is not drawn but the verdict still stands. The provider xG accompanies as a side reading. History backfill via `scripts/backfill-history.mjs` (the pipeline's `eventDay` reads `event_date`); rolling evaluation without leakage in `scripts/evaluate-predictions.mjs` → `evaluation.stats`.
- **Fifth pass — one protagonist per chapter:** the stage no longer stacks charts. Each tab keeps **a single protagonist chart** (form, waffle, ladder, leg race or verdict bars) and everything else moves down to its chapter in a `.notes-visuals` block (`display:flex; gap:24px;` with a 1px rule above), placed after the text and the table, before «¿qué significa esto?» and the closing notes. The block enters once with `IntersectionObserver` (`.is-in`, threshold 0.15) which triggers the same `.pt-*` vocabulary; without JS or with reduced motion it stays visible and static. The internal scroll of long panes disappears: the stage always fits. Duplicated closing and provenance notes are consolidated in the chapter.
- **Entry vocabulary (match):** `.pt-grow` (scaleY from the base), `.pt-grow-x` (scaleX from the left) and `.pt-fade`, under `.stage-pane.is-active` or `.notes-visuals.is-in` with staggered `--d` and `both`; with reduced motion they stay in the final state. New decimals with a decimal comma (`~1,2`); tabular figures are kept.

- **Query header:** «Última consulta: {fecha}» (Last query: {date}) replaces the provider mention in the title; it is printed in UTC (`YYYY-MM-DD HH:mm`) and the client rewrites it to the visitor's time zone (all occurrences). The provider lives in the notes and in the stage footer.
- **Estimated shirts (`TeamJersey.astro`):** single-cut SVG painted with `src/lib/team-colors.js` (hand-curated colours, falls back to neutral grey if the club is missing); optional `stripes`/`sash` patterns. The **radar scan** is a grid of the site green (7px SVG pattern) in a masked band that sweeps the garment clipped to its silhouette, 5.8s cubic ease with the away side offset by 1.5s; with reduced motion a static band at 45% remains. 88px card, 12px radius, 1px rule.
- **Venue zoom:** pre-generated equirectangular crop (~20°×12.6°, 0.35°/cell, `public/img/venue-zoom/{slug}.png` via `scripts/generate-venue-zooms.mjs`) with the **inverted drop pin** in lime anchored to the lat/lng of the `venues.js` catalogue; the site logo rotates inside at 16s linear (static with reduced motion). The block **is always drawn** and the estimated shirts accompany it at the side on desktop (stacked and centred at ≤760px). Without a resolved venue, the Europe reference map (`europa.png`, no pin) locates the continent and the footer declares the absence: «sede sin ubicación en el mapa · referencia: Europa» (venue without a location on the map · reference: Europe). Footer with stadium · city, country.
- **Probability chapters (third pass):** see "the narrative in 6 chapters" above; this bullet from the second pass is superseded. The source JSON (`public/match-probabilities/{id}.json`) remains manually reviewable.
- **Illustrative pitch (`PitchScene.astro` + `/api/live/[id].json`):** SVG pitch with system lines, lime ball and trail; the server draws anchors (goals in the attacking area, cards, substitutions) with a deterministic simulation seeded by id (`src/lib/pitch-path.js`), and the client interpolates with sinusoidal wobble at real-minute pace, replays the full fixture in ~24s on completion (with a «Repetir» (Replay) button) and leaves the ball in a soft drift before kickoff. When the match is in window, it queries the live endpoint every 60s (60s edge cache: API consumption does not depend on traffic) and updates scoreline, minute and events; without a response, it degrades to the baked data. The note «animación ilustrativa, no un seguimiento de posición» (illustrative animation, not a position tracker) always accompanies; with reduced motion everything stays static. The AI reading lives after, full width (see "The reading: analyst board").
- **Cards per team (third pass):** the `team-context` section is removed; its panels live in chapter 1 (see above). The `.team-panel`/`.context-list` classes are reused in the notes column; the `.team-context*` container rules are removed.
- **The reading: analyst board (2026-09 extension, fourth pass):** the AI block leaves the book-style paragraph and becomes cards with a scene. Each section of the JSON (`llm-analysis.json`) carries `kind` (enum `panorama · modelos · historial · tabla · goleadores · forma · claves`, chosen by the provider) and up to 3 `stats` (`{value ≤12, label ≤28}`) that **must appear literally in its bullets**; the validator discards the rest. The view (`ReadingBlock.astro` + `ReadingScene.astro` + `src/lib/reading.js`) draws a flat SVG scene per type (kick-off on the pitch, goal duel with the ball crossing, two directions with a common point, standings grid, scorers podium, ticker strip with the next match in a signal stroke, corner flag) using the `ContactScene` vocabulary: 1.7 stroke, dashed guides, one lime ball per scene, no glows or gradients. The first card goes full width with a 148px scene; the rest in two columns (one at ≤1150px). **Protagonist figure:** the figure strip shows each `value` in Barlow Condensed 700 tabular with its `label` below; the first figure of each card is the only lime (Signal Rule) and the bullet text repeats it highlighted in warm ink at weight 650: a number the section does not declare is never enlarged. The figure is printed with a decimal comma (`1.71 → 1,71`). The `limits` audit is never printed: it lives only in the JSON, same as the `llmReview`. The header carries the label «Interpretación de IA» (AI interpretation) next to the title and a provenance note; without `kind`/`stats` (v2 entries) the section is drawn the same way with a scene inferred only from the title (bullets do not vote: mentioning history or past points painted two sections with the same scene) and without a figure strip, and the legacy paragraph keeps its one-section card. The scene strokes and figures are revealed once when the block enters (`.is-armed`/`.is-in`, `--d` staggered per card); without JS or with reduced motion everything stays static and visible. Without an LLM reading the block is not drawn and instead «Lo que dicen los proveedores» (What the providers say) appears (`ProviderAdvice.astro` + `src/lib/provider-advice.js`): Bzzoiro picks and AF advice in neutral Spanish, always attributed, never as a GoatLab recommendation.
- **AdSense pauses:** four reserved slots (`partidoPrevio`, `partidoStory`, `partidoCancha`, `partidoCierre`) after the header, after the narrative, after the pitch and before the footer; the sticky stage area and the pitch stay ad-free; the reading board lives between `partidoCancha` and `partidoCierre`.

## Do's and Don'ts

### Do:

- **Do** label demonstrations, sources, delays and update dates next to the data.
- **Do** keep axes, scales and series colours when changing chapter.
- **Do** keep advertising in reserved spaces outside the chart and the text being read.
- **Do** design the empty state with a clear next action.
- **Do** respect `prefers-reduced-motion` and visible keyboard focus.

### Don't:

- **Don't** show predictive percentages without a published historical evaluation.
- **Don't** use synthetic data as if it were real matches.
- **Don't** use text gradients, glows or block shadows as decoration.
- **Don't** put links to betting houses or calls to bet.
- **Don't** hide an absence of data behind an animation or an invented number.
