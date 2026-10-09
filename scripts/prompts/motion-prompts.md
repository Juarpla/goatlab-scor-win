# Motion prompts · version 4.1 (motionSystem carbon-v1)

Return only JSON: {"prompts":[{"n":1,"kind":"form","title":"...","presentations":["editorial","statistical"],"factIds":["home.wins"],"beats":[{"t0":0.0,"t1":1.5,"action":"entry","detail":"..."}],"easing":{"enter":"ease-out","curve":"cubic-bezier(0.23,1,0.32,1)","exit":"ease-out"},"background":{"variant":"carbon-grain","base":"#101412","texture":"...","safeArea":"left64 right64 top120 bottom480"},"motion":{"spring":{"damping":22,"stiffness":180,"mass":0.6},"countUp":true,"staggerMs":60,"scaleFrom":0.95},"camera":{"move":"push-in 1.0 to 0.9 + drift","tilt":"0deg"},"transition":{"in":"wipe","editorialToStatistical":"dissolve","out":"collapse"},"emphasis_words":["DERROTAS"],"prompt":"... {{home.wins}} ..."}]}. Produce fifteen entries, numbered from 1, each with a kind from the supplied set (any order, repeats allowed with distinct title and editorial variant). Fifteen is the target: enough variety for ten final clips with editorial/statistical alternation, without filler variants. Titles and instructions are English; on-screen labels are Spanish. The input facts catalog is the only source of match statistics; editorial animation needs no verified facts.

Write 250–400 words per prompt, detailed enough for a sports motion designer to implement. Each provides editorial AND statistical presentations in vertical 9:16, approximately 6–10 seconds adapted to the spoken words. Define layout, typography, colours, chart type, common scale, labels, units, source/sample annotation, temporal stages, entry animation, main comparison, emphasis, camera movement, transitions and exit. Reserve the lower quarter for permanent yellow subtitles. Use GoatLab charcoal #101412, warm white #edf0e6, lime #c5ed74 and slate #8ca6bf. Maintain professional hierarchy and one focal point, with legible Spanish labels.

Reference every quantitative chart value as {{fact.id}} and list each used ID in factIds exactly once. Never write hardcoded statistics in prompt prose. Values, labels and units will be resolved by the renderer, not the model. Do not create new facts or predicted scores. Comparisons require the same unit; sample sizes and sources remain attached to facts. Instructional timing and dimensions may use numbers, but factual quantities must be placeholders.

1 form: wins, draws and losses over each available recent sample, with Spanish team labels. Use grouped count bars, shared zero baseline; identify unequal samples.
2 goals: goals for and against, paired bars for both teams, shared scale, unambiguous labels and football context.
3 clean-sheets: compare clean sheet counts and sample sizes without converting counts into rates.
4 head-to-head: compare available historical win/draw counts, with total sample. Historical data is not a forecast.
5 synthesis: select compatible available facts to summarize one grounded statistical tension. Use published model estimates only if supplied in catalog and published=true; source-attributed Spanish labels must distinguish estimates and history.

Give a distinct editorial variant for each entry: form uses kinetic typography and rhythmic emphasis; goals uses an illustrative football pitch and ball path; clean-sheets uses defensive energy and a stylised shield; head-to-head presents both teams as a visual duel; synthesis uses team reveals and narrative emphasis. Repeats of the same kind must vary the editorial variant (different words, path, camera or emphasis) so the ten final clips never look identical. Editorial variants have no statistical axes, sample claims or invented match events. Use Spanish team names and generic sports headings, or phrases from the narration. Describe composition, motion, emphasis, transitions and exit in both variants. The planner should alternate creative and statistical blocks when relevant; without relevant statistics it can make a fully creative montage.

Executable contract per entry (machine fields, in addition to prose):
- beats: 3–4 entries covering [0,span], each {t0,t1,action: entry|build|main|exit, detail}. Ordered, non-overlapping.
- easing: {enter: ease-out, curve: cubic-bezier(0.23,1,0.32,1) or cubic-bezier(0.16,1,0.3,1), exit: ease-out}.
- background: {variant: carbon-grain|carbon-glow|carbon-grid, base: #101412, texture: short text, safeArea: left64 right64 top120 bottom480}.
- motion: {spring: {damping: 22, stiffness: 180, mass: 0.6}, countUp: boolean, staggerMs: 30–80, scaleFrom: 0.95}.
- camera: {move: push-in 1.0 to 0.9 + drift | tilt down | orbit leve | fixed + parallax, tilt: 0deg–2deg max}.
- transition: {in: wipe|stripe sweep, editorialToStatistical: fade|dissolve|wipe, out: collapse|slide|shutter}.
- emphasis_words: 1–3 Spanish keywords anchored to narration.

If facts for a topic are unavailable, factIds is empty. Prioritise the editorial variant. If the voice explicitly requests missing statistics, describe an honest Spanish 'Datos no disponibles' title sequence with restrained geometric animation, never invented axes, zeros or values. Each prompt must include source/sample treatment (using literally the word source or sample), Spanish labels (using literally the word Spanish), transitions (using literally the word transition), and 9:16. When published is false, never write the % character anywhere in any prompt (not even for layout, timing or dimensions — use fractions such as lower quarter or half width instead), never write the words percent/percentage, and make no predictive claims.

These five directions are options for a transcript-guided montage: pick only the ones the narration supports, fifteen scenes (a direction may repeat with distinct variants, never the same editorial variant twice). Do not force a topic into an audio that does not discuss it. The planner selects and adapts the relevant direction while preserving exact fact IDs, and avoids repeating the same motionPromptNumber across the ten final clips unless the narration demands it with justification.

## Cinematic system (carbon-v1, obligatorio citar)

Reference `"motionSystem": "carbon-v1"` in every entry. Only define overrides when a beat needs them.

Bans (never do this): linear easing anywhere; animating width/height/top/left (use transform scale + opacity only); scale from zero (always 0.95 + opacity); more than 2 signature moves per video; captions overlapping graphics (safeArea left64 right64 top120 bottom480 is sacred).

Each entry declares `"signature_move"` (exactly 1 from: camera-push, glow-pulse, stagger-reveal, count-up-slam, duel-collide, pitch-run). Across the fifteen entries use at most 5 distinct signature moves (ideally one per kind) so any ten-clip selection stays cinematic, never busy. The planner still caps 2 per video.

Each statistical entry declares `"revealMode"`: `sequential` (bars grow staggered with count-up) or `spotlight` (all mounted, focus scales 1.05 with lime glow, rest dimmed). Vary both across entries.

Captions are kinetic: words rise with mask (translateY + opacity), never plain fade. Emphasis words use one style only: lime-glow, bracket, outline-pulse or slam.

Each entry closes with `"design_rationale": {"beat": "...", "tecnica": "...", "porque": "..."}` in one line each: which beat, which technique from this system, why it serves the narration. This is for QA debug, never rendered.
