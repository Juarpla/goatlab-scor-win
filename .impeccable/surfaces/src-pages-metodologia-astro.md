# Surface brief — Methodology

- **Target:** `src/pages/metodologia.astro`
- **Mode:** Read (the visitor understands how the analysis is built and evaluated) with a Persuade close (CTA to Encuentros).
- **Scope:** rewrite of the page inside the established world (DESIGN.md); extension of the `.story` pattern from `partido/[id].astro`.

## Direction (direction contract)

**THESIS:** Methodology is not read, it is traversed: each layer of the analysis (data → AI → editor) is explained with an SVG illustration that draws itself as the reader advances. The static text-only page (the incumbent version) is rejected, as is the wall of homogeneous cards.

**OWN-WORLD:** DESIGN.md palette (carbon #101412, matte surface #181e1a, lime #c5ed74 as the only signal, slate blue #8ca6bf as the second series). Barlow Condensed for chapters and large figures; Manrope for reading. Illustrations: flat vector diagrams with 1px linework and tonal fills, SVG geometry, not "pictorial illustration". Same `.story` grid with sticky stage as the match page.

**STORY:** The visitor understands the three layers in order, sees how the statistic is evaluated (publication gate, real figures from evaluation.json), understands that AI is not a source of results, that ads live outside the analysis and that there is no betting. They leave toward Encuentros with the product phone in view.

**FIRST VIEWPORT:** Thesis "Los datos necesitan contexto." (Data needs context.) on the left (Barlow 60px) with a small diagram of the three layers (three nodes connected by a line that draws itself) on the right; below, the scrollytelling starts: notes on the left, sticky stage on the right with the chapter 1 illustration (Poisson curve with growing bars).

**FORM:** Precisely specified by the user in grilling: reused `.story` pattern, 3 chapters + sticky stage with one SVG per chapter, 3 AdSense units (after chapter 1 horizontal, after chapter 2 rectangular, final horizontal), SVG phone in stage chapter 2 and in the close, anchors `#datos-historicos` `#analisis-ia` `#criterio-editor` intact, editable text preserving all data. Seed: n/a (tight request, no concept tournament).

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Content notes

- Keep all claims from the incumbent text: providers, "we do not publish invented figures", frequency ≠ probability, Poisson + CatBoost + signals, declared weights, publication gate, dynamic figures from `evaluation.json`, AI limitations, separate ads, no links to betting.
- Add the non-affiliation note with Bzzoiro (PRODUCT.md requires it in methodology; it is missing today).
- Home anchors intact (`index.astro` → guide).
- Ads: `src/config/ads.ts` with placeholder credentials; without credentials, AdSlot shows the existing reserved space. ads.txt placeholder in `public/`.

## Unresolved

- Real AdSense credentials (the user will paste them into `src/config/ads.ts`).
