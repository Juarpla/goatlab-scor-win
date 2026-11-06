# Creative instruction audit — 2026-11-05

Diagnostic record of this consolidation, not an additional authoring policy.
Current direction is in
[creative.md](../.agents/skills/video-render/references/creative.md), fixed identity
in [brand.md](../.agents/skills/video-render/references/brand.md), operations in the
[skill](../.agents/skills/video-render/SKILL.md), and implementation in
[remotion.md](../.agents/skills/video-render/references/remotion.md).

| Finding | Effect on the old flow | Resolution |
| --- | --- | --- |
| Creative rules repeated in the skill, creative reference, brand, STYLE and Remotion examples | Repetition amplified some rules and made updates drift | One creative reference; separate fixed identity and technical contract. STYLE remains a link for old callers. |
| Every usable clip and 2–4 figures required | Narration could be forced to accommodate the inventory and statistics | Selection follows relevance and quality; no asset or figure quota. |
| Absolute ban on upscaling versus 720p clips in 1080p delivery | A normal full-canvas clip violated the stated rule | Permit delivery scaling; assess additional crops against actual prepared dimensions and visible sharpness. |
| Technical examples used nearly opaque dark gradients and large overlays | Copying the examples contradicted bright, media-led direction | Replace aesthetic examples with a minimal API illustration and move visual judgment to the creative reference. |
| Kit captions defaulted to white/green; right padding was smaller than the safe area | The simplest use of Captions violated the documented identity/layout | Yellow fill, black outline and safe-area padding by default; active words inherit the fill. |
| StatCard labels/sources defaulted below the documented readable size | Default data graphics required corrective styling | Raise those defaults to 40 px; custom formatting remains available. |
| COMPLIANCE said stills only, yet allowed Agnes clips elsewhere | Agents could reject supported source animation | Preserve the ban on broadcast footage and explicitly admit referential generated clips with provenance. |
| COMPLIANCE used 49.9 s, 45.9 s and public/shorts | Technical limits conflicted with the running renderer | Align to short-format.js and layout.js: 55 s total, 53 s voice, at most 1.10× adjustment and current folders. Legacy endcard constants remain untouched. Correct the skill's manifest location to work/<id>/manifest.json. |
| Historical remote reports were linked as current guidance | Optional captions/music, advisory delivery and Fly limits competed with the local skill | Mark all three October reports historical and link active sources at the top; route README to current guidance. |
| montageDirection() embedded another creative prompt, including a graphics-only fallback | Another location could reintroduce divergent creative rules | Repository search found no production callers; remove the unused export and its wording assertions, retaining capacity/mode tests. |
| scenes described as sampling points, but reviewTimes() ignores them | Authors could assume a selected critical moment would be inspected | Document fixed sampling and require temporal review of transitions/overlays separately. |
| Five frames used as the main creative QA | Static samples cannot establish rhythm, loop quality or moving-subject visibility | Keep technical samples and add continuous playback, or disclose a denser-frame fallback when playback is unavailable. |

Source image prompts and `src/lib/video-animation.json` still govern generation.
The spoken-writing skill still governs narrative beats. Those are distinct stages,
not alternate sources of direction for the final montage. Their production
settings were not changed in this consolidation.

The new direction favors purposeful framing, editing and restrained supporting
motion without imposing a scene sequence or effect catalog. It is a documented
creative intent, not evidence that a real recording has already improved. A full
render with a real voice and bank is still needed to judge the resulting style.

## Validation of the consolidation

- 62 relevant Node tests passed: media policy/generation, authored plans, renderer
  interface, kit timing helpers and voice policy.
- Both modified skills passed the bundled skill validator. All 63 local Markdown
  links in the modified documents resolved; `git diff --check` passed.
- `pnpm video:layout` passed.
- A synthetic three-second kit smoke render compiled the modified JSX and produced
  H.264 at 1080×1920/30 fps with no layout warnings. Inspected frames confirmed the
  default yellow captions, readable card labels and the engine-owned closing.
  This was a silent renderer test, not a voice/music mix or a creative validation
  with real match media. Local artifacts are under
  `video-render/work/tests-qa/creative-instructions-qa/` (ignored by git).
