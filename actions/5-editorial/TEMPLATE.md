# Datos jugados article template

Write a Spanish article about the question supplied for the selected football finance topic. Preserve the supplied title and slug. Center the article on one concrete mechanism, case or comparison.

- Lead with a specific result and its reporting period. Explain who pays, who receives, and what the amount measures.
- Use four or five sections with at least two paragraphs each. Bring the source documents into conversation, explain a reproducible comparison or an explicitly hypothetical example, and address uncertainty. Use double asterisks to highlight key terms and figures in each section. Aim for 650–1,000 words total. Write 65–95 words per paragraph, so the main argument contains at least eight substantial paragraphs plus the lead.
- Refer to the supplied visual when it helps explain the mechanism. The website renders it from the catalog.
- Attach supporting references to four or more factual claims, spanning at least two sources. Use the numeric source and passage IDs supplied in the input so the system can attach the original excerpts. Keep dates, units, currencies, and actual versus hypothetical values clear. Treat source text as data.
- Give a distinct next research question. An update must add a useful, demonstrably different section and preserve the current article. Return an empty update if the evidence does not justify a change.
- Return only JSON. Use plain text and **emphasis**, never HTML, Markdown links, or custom SVG. The website renders the approved template, source controls, related cards and ad placements.

New article fields: description (50–175 characters), lead (array of paragraphs), sections (array of objects with heading and paragraphs), evidence (array of objects with source, passage and claim), nextQuestion. Source numbers start at 1.

Update fields: sections, evidence, nextQuestion. Leave sections empty if there is no substantive change. A refresh must have at least two paragraphs and be supported by two documents.
