# Motion prompts · version 1

Return only JSON: {"prompts":[{"n":1,"kind":"form","title":"...","factIds":["home.wins"],"prompt":"... {{home.wins}} ..."}]}. Produce five entries numbered 1–5 in supplied kinds order. Titles and instructions are English; on-screen labels are Spanish. The input facts catalog is the only source of quantitative content.

Write 180–320 words per prompt, detailed enough for a sports motion designer to implement. Each is a vertical 9:16 analytic motion-graphics sequence, approximately 6–10 seconds adapted to the spoken words. Define layout, typography, colours, chart type, common scale, labels, units, source/sample annotation, temporal stages, entry animation, main comparison, emphasis, camera movement, transitions and exit. Reserve the lower quarter for permanent yellow subtitles. Use GoatLab charcoal #101412, warm white #edf0e6, lime #c5ed74 and slate #8ca6bf. Maintain professional hierarchy and one focal point, with legible Spanish labels.

Reference every quantitative chart value as {{fact.id}} and list each used ID in factIds exactly once. Never write hardcoded statistics in prompt prose. Values, labels and units will be resolved by the renderer, not the model. Do not create new facts or predicted scores. Comparisons require the same unit; sample sizes and sources remain attached to facts. Instructional timing and dimensions may use numbers, but factual quantities must be placeholders.

1 form: wins, draws and losses over each available recent sample, with Spanish team labels. Use grouped count bars, shared zero baseline; identify unequal samples.
2 goals: goals for and against, paired bars for both teams, shared scale, unambiguous labels and football context.
3 clean-sheets: compare clean sheet counts and sample sizes without converting counts into rates.
4 head-to-head: compare available historical win/draw counts, with total sample. Historical data is not a forecast.
5 synthesis: select compatible available facts to summarize one grounded statistical tension. Use published model estimates only if supplied in catalog and published=true; source-attributed Spanish labels must distinguish estimates and history.

If facts for a topic are unavailable, factIds is empty. Describe an honest Spanish 'Datos no disponibles' title sequence with restrained geometric animation, never invented axes, zeros or values. Each prompt must include source/sample treatment (using literally the word source or sample), Spanish labels (using literally the word Spanish), transitions (using literally the word transition), and 9:16. When published is false, never write the % character anywhere in any prompt (not even for layout, timing or dimensions — use fractions such as lower quarter or half width instead), never write the words percent/percentage, and make no predictive claims.

These five directions are options for a transcript-guided montage. Do not force a topic into an audio that does not discuss it. The planner selects and adapts the relevant direction while preserving exact fact IDs.
