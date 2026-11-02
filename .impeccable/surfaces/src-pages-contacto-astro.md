---
version: 1
slug: "src-pages-contacto-astro"
primary_target: "src/pages/contacto.astro"
related_targets: ["src/styles/contacto.css","src/components/PromoSlide.astro","src/components/ContactScene.astro"]
---

---
version: 1
slug: "src-pages-contacto-astro"
primary_target: "src/pages/contacto.astro"
related_targets: ["src/styles/contacto.css", "src/components/PromoSlide.astro", "src/components/ContactScene.astro"]
---

# Surface brief — src/pages/contacto.astro

## Scope and visitor mode

Route `/contacto/`, web platform. **Read** mode: the visitor understands how to report an error, what limits AI-prepared analyses declare and what is out of scope by editorial criteria; the closing band promotes the site itself. Audience: Spanish-speaking LATAM reader who found a questionable figure, wants to know how the AI is controlled or what is not covered. Action: write to contacto@scor.win (mailto) or continue to /encuentros/ from the closing slide.

## Constraints

- World fixed by DESIGN.md ("The analysis room"): carbon #101412, warm ink, lime only as a signal, slate blue as the second series, matte surfaces, 1px rules, 12px radii on panels and 5px on controls; no gradients, glows or decorative shadows.
- Condensed copy preserving facts verbatim: email contacto@scor.win; corrections are reviewed before the next scheduled update; AI analyses state their limitations next to the text; permanent exclusion of odds, betting houses and betting recommendations.
- No crests and no betting content. SVGs are declarative geometry of the method (bars, envelope, magnifier, prohibition), never real matches, figures or illustrative scenes; they are labelled as decorative (aria-hidden).
- Vanilla JS + CSS, no new dependencies. Without JS: full text and first chart visible. `prefers-reduced-motion`: instant swap, no animated stroke. Visible focus and markup reusing the global `.story` grid.
- The closing slide is GoatLab self-promotion (not AdSense inventory): no PUBLICIDAD (ADVERTISING) label, with an SVG phone mockup (schematic UI, no invented scorelines) and a CTA to /encuentros/. It must be visible on mobile.
- Organic AdSense slots consistent with the methodology: two reserved inside `.story-notes` (rect after chapter 2 `contactoCap2`; horizontal at the close `contactoCierre`), pacing `margin-block:6px`, ad-free stage. Approved by the user after the first ship ("2 slots").

## Chosen direction and memorable moment

Direction chosen by the user through an interview (grilling, "yes to all recommendations" + "add dynamism and beauty"): light scrollytelling, three chapters on the left and a sticky stage on the right whose line diagram changes per chapter (no tabs); at ≤760px the stage disappears and each chapter carries its diagram inline. Self-promotion slide at the close with a phone mockup and an animated verdict bar. Memorable moment: the stage stroke that draws itself on each chapter change (standout figure → magnifier → prohibition).

## Unresolved decisions

None. Resolved at close with user approval: entry "Contact and promotional close (2026-09 extension)" added to DESIGN.md. Finish review verdict: ship (re-review with `contact-*.png` evidence, verified hashes).

---

## Direction contract

**THESIS.** The contact page is one more chapter of the analysis room: reporting an error is part of the method, not a footer. It rejects the category default: static three-paragraph `prose` with a lot of text; instead, three chapters that advance over a fixed graphic stage that redraws itself, and an editorial close that promotes the product without disguising itself as a third-party ad.

**OWN-WORLD.** Carbon #101412; stage and slide on matte surface #181e1a with rule #354035 and 12px radius; lime #c5ed74 only as a signal (standout figure, estimated bar, prohibition, CTA); slate blue #8ca6bf as the second series of the diagrams; Barlow Condensed for chapter and slide headlines, Manrope for reading, notes (11px) and metadata with tabular numerals; no kickers, no shadows, no glass.

**STORY.** The visitor understands: where to report (real email; review before the next scheduled update), that AI marks its limits and that reporting an invented figure is exactly what is wanted, and that odds/betting houses are out by permanent editorial criteria. They believe the site corrects itself in public. They act: write to the email or enter /encuentros/ from the close.

**FIRST VIEWPORT.** At 1440px: standard header; h1 "Contacto." (Contact.) display ~72px with one introductory line (no kicker); story grid: on the left chapter 1 ("Reporta lo que / no cuadra." — Report what does not add up) with the mailto as an action control on a raised surface and a corrections note at the bottom; on the right, a sticky matte stage with scene 1 (row of bars in slate blue, one taller lime bar with a ring, arrow toward an outline envelope) already visible, drawing itself on load. No kickers or section numbering.

**FORM.** Chosen form: light scrollytelling over the existing `.story` grid (chapters + sticky stage with SVG layers crossing is-active/is-leaving), no tabs or manual override; activation by scroll marker with rAF (match pattern, also works with reduced motion); at ≤760px the stage is out and each chapter has an inline diagram. Signature moment: the stroke (`ct-draw` with pathLength) that draws itself when each chapter activates; on the slide, the phone's verdict bar that fills once when entering view (`js-anim` + `in-view`, home-page pattern). Tightly specified request: no tournament or seed key.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
