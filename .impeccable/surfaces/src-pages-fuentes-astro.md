---
version: 1
slug: "src-pages-fuentes-astro"
primary_target: "src/pages/fuentes.astro"
related_targets: ["src/styles/fuentes.css"]
---

# Surface brief — src/pages/fuentes.astro

## Scope and visitor mode

Route `/fuentes/`, web platform. **Read** mode: the visitor understands where the data comes from before continuing through the site. Audience: Spanish-speaking LATAM reader who wants to know what backs each figure and what limits the site has. Task: identify the 3 sources, their cadence and the brand rule. Action: open a source or move to methodology/privacy.

## Constraints

- Visual world fixed by DESIGN.md ("The analysis room"): carbon, warm ink, lime only as a signal, slate blue as the second series, matte surfaces, 1px rules, no gradients or glows.
- Advertising only as reserved spaces (`AdSlot.astro`), outside the chart and the text being read; at least 2 visible on mobile.
- Condensed copy but verbatim on facts: 2:00 a.m. cadence (Peru time), scorelines every 6 hours, shared queries, no ball positions or continuous tracking, full crest disclaimer, links to api-football.com, football-data.org, sports.bzzoiro.com, /metodologia/, /privacidad/.
- No invented sports data: the diagrams show the shape of the data, not matches or fictional figures. Provider monograms as initials text (AF, FD, BZ), not third-party logos.
- Vanilla JS + CSS, `prefers-reduced-motion` respected, visible focus, no new dependencies.

## Chosen direction and memorable moment

Direction chosen by the user through an interview (grilling, confirmed answers "yes to all"): hybrid scrollytelling, SVG reveals per section for the 3 sources, sticky stage with a dial for "How often", generic crest for brands; 3 fixed `AdSlot`s between chapters. Memorable moment: the 24 h dial that sweeps the day on scroll and lights the 6 h marks, with the 2:00 a.m. notch (Lima).

## Unresolved decisions

None blocking. Pending from the user: actual AdSense activation (out of scope; slots remain placeholders).

---

## Direction contract

**THESIS.** This page is the analysis room's diagram: three free-provider pipelines feed the board that GoatLab publishes. It rejects the category default: a long `prose` text document with provider lists; instead, each source is a geometric scene with its source rule at the bottom, and update timing is an instrument, not a paragraph.

**OWN-WORLD.** Carbon #101412 with warm ink #edf0e6; lime #c5ed74 only as a signal (live node, sweep arc, 2:00 notch, lit ticks); slate blue #8ca6bf for the second series; matte surfaces #181e1a and raised #222a24 with 1px #354035 rules; 12px radii on panels, 5px on controls; Barlow Condensed for names and large figures, Manrope for notes and metadata with tabular numerals; initials monograms on raised surface; no shadows, no glass.

**STORY.** The visitor understands: every figure has a source and a date; there are three providers with different roles (scorelines; window and history; xG, events and model); data refreshes on fixed, shared schedules; crests belong to their owners. They believe the site declares its limits honestly. They act: open the source they care about or continue to methodology/privacy.

**FIRST VIEWPORT.** At 1440px: standard header; in the page viewport, a two-line display h1 "De dónde salen / los datos." (Where the data comes from) (second line in lime, ~72px) on the left with a 2-sentence introductory paragraph and 2 contextual links below; on the right, a matte 12px panel with the pipeline scene: three labelled rules AF / FD / BZ that converge on a lime node and feed a schematic scoreboard with a live dot. No kicker above the h1. The scene draws itself once on entry (advancing strokes, staggered).

**FORM.** Chosen form: hybrid scrollytelling in a two-column grid with zebra rhythm (copy|scene alternates), pinned dial in the frequency chapter, quiet close with a generic crest and links. Derived directly from the interview; no tournament or seed key (tightly specified request). Signature moment: the dial sweep tied to scroll with --freq-progress.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

---

## Extension note — 2026-09-16 (documentation check, ordinary-extension audit)

Audit of the finished build (`src/pages/fuentes.astro` + `src/styles/fuentes.css`) against `DESIGN.md` ("The analysis room") and `global.css`: full token parity (zero hardcoded hex/rgb; every color/spacing/radius resolves to a `:root` token; fonts only `var(--display)`/`var(--body)`), `AdSlot` reused unmodified ×3, `.f-note` mirrors incumbent `.chapter-note` (11px muted + 1px top rule), sticky stage/reduced-motion/mobile mirror `.story-stage`, `js-anim` + rAF-passive scroll mirror `index.astro` / `partido/[id].astro`, zero raster assets (all visuals inline SVG).

Genuinely new durable component rule committed, not covered by DESIGN.md:

- **Frequency dial (`.f-dial-*`)**: a 24 h instrument whose state lives in a scroll variable (`--freq-progress` 0-1 in `.f-freq`) that governs the arc (`stroke-dashoffset`), the needle (`rotate`), the lit ticks (threshold `p ≥ .01 + k·.25`) and the active notes. At rest without JS and with `prefers-reduced-motion`. Candidate vocabulary for a future extension section in DESIGN.md (precedent: per-page extensions for home page/matchday/contact).
- The `.f-scene .s-*/.t-*` family is page geometry that reuses the documented precedent of declarative geometry (DESIGN.md, "Method scenes"): a coherent extension, with no system change (same tokens, sparse lime, slate blue as the second series).
