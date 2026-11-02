# GoatLab

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Spanish-speaking audience in Latin America that wants to understand football fixtures through statistics and predictions. It includes readers who use this data to make betting-related decisions, but GoatLab will not promote betting or link to betting houses.

The experience must work on phones and desktop. Times will adapt to the visitor's time zone, with Lima as the fallback reference.

## Product Purpose

Explain featured football fixtures through easy-to-interpret data, visual comparisons and short explanations. Google AdSense advertising will be the main planned revenue source to sustain the site, without harming the reading experience.

## Positioning

A sports analytics tool that prioritizes tables and charts over long articles. It will offer two differentiated sections: analysis based on sports data and analysis prepared with AI. Textual explanations will be brief, in short separate paragraphs.

## Operating Context

Readers will consult previews, historical statistics, possible match scenarios and match tracking when data is available. The initial requested coverage includes Champions League, Europa League, Copa Libertadores, LaLiga and Premier League; effective access depends on the free providers.

## Capabilities and Constraints

- Responsive site built on the existing Astro project.
- GitHub Actions to prepare data and analysis; Cloudflare Pages as the chosen host.
- Free sports sources only at this stage. API-Football will be the main provider and Football-Data.org the fallback. Switching providers must respect differences in coverage, metrics and update frequency; they are not interchangeable across every feature.
- Do not expose credentials to the browser. Share fetched data between visitors to control consumption.
- If both providers fail or do not cover a feature, omit it or show an honest alternative, depending on context. The user delegated this presentation decision.
- Continuous-motion graphical tracking is an aspiration conditional on having real data. Do not represent invented positions as a real broadcast. If data is missing, a simpler tracking or its absence is acceptable.
- Include historical statistics and sports predictions, differentiating both. The user wants to cover the usual betting scenarios through everyday football language and percentages, without presenting odds.
- The desired breadth includes results, goals, first goal and its intervals, per-period statistics, corners, cards, fouls, shots and players. Coverage will be progressive, a decision confirmed by the user: add categories as sufficient data and evaluated models exist; do not require all of them at launch.
- Predictive percentages need a statistical methodology evaluated with historical data; generating text with an LLM does not by itself prove reliability. Source, sample, date and limitations must be consultable.
- AI analysis prepared per match and shared between readers; no public chat has been requested.
- LLM client requested in `src/lib/llm.js`, without SDKs, using `fetch`, compatible with Node and workerd and the OpenAI Chat Completions format. Providers configured by environment variables, with default priority Mistral → Workers AI → OpenCode Go.
- Confirmed LLM contract: resolve the chain at runtime; skip providers without credentials or requirements; deduplicate; log unknown names; one attempt per provider; failover on any failure, including empty content or consumer validation; configurable timeout of 60 seconds by default; `temperature: 0`; aggregated error when all fail. Consumers may degrade without blocking the site. JSON extraction must accept responses with code blocks or additional reasoning. Concrete endpoints and models are pending verification.
- Prepare AdSense placements initially. Enable real ads only with the approved account and configured identifiers; availability has not been confirmed.
- Permanent exclusion: links to betting houses. Odds and calls to bet are also out. Using everyday vocabulary does not change the nature of the content or guarantee AdSense approval.

## Brand Commitments

- Confirmed name: **GoatLab**.
- Initial language: Spanish for Latin America.
- Explicit preference for a dark interface.
- Explicit preference for scrollytelling, with charts and tables in the lead. No feed of real videos has been requested.
- Advertising distributed so that it does not cover or interrupt comprehension of the content.

These preferences are user commitments; palette, typography, composition and the concrete scrollytelling behavior will be defined in later design work.

## Evidence on Hand

The repository contains the Astro starter; there is still no custom interface, data integration, predictive models or GoatLab analysis.

References proposed by the user: [Scores24](https://scores24.live/es), [BetMines](https://betmines.com/es), [Flashscore](https://www.flashscore.com/), [StatsBomb Open Data](https://github.com/statsbomb/open-data) and [Football-Data.co.uk](https://www.football-data.co.uk/). They are references or candidate sources; authorized access, integration and reuse licensing for this product have not been confirmed.

Providers chosen later:

- [API-Football](https://www.api-football.com/pricing): the documentation consulted confirms 100 daily requests and season restrictions on the free plan. Do not assume availability of any season or metric because of the catalog's general scope.
- [Football-Data.org](https://www.football-data.org/pricing): the documentation consulted confirms 12 competitions, 10 requests per minute and delayed results on the free plan. Do not present them as instant tracking.

There are no validated predictive percentages, evaluation results, confirmed credentials or approved AdSense account. Do not invent this evidence.

Bzzoiro license (investigated, v4.0, docs consulted in 2026-09): crests and photos belong to their respective owners, are not covered by the data license, and the provider expressly allows them «to identify teams, players, competitions and venues within the application»; hotlinking is allowed without authentication; an asset can be withdrawn at any time at the owner's request (the endpoint responds 204). Use approved by the user: hotlink crests only for identification on the wall and the match page, with a fallback monogram and a non-affiliation note in privacy and methodology. Do not use crests in promotional material.

## Product Principles

1. Make data understandable through visualizations accompanied by brief explanations.
2. Separate historical facts, statistical estimates and AI interpretation.
3. Keep the analysis accessible when data is missing, providers fail or ads are not served.
4. Fund the content without sacrificing readability or confusing advertising with sports information.
5. Fit coverage and freshness to free limits, showing relevant limitations to the reader.

## Open Decisions

- Statistical models, evaluation criteria and sufficient historical data for each category.
- Selection and daily number of matches with deep analysis; a limit of two was not confirmed.
- Update frequency and request-budget split between previews and tracking.
- Storage and dynamic query mechanism on Cloudflare Pages.
- Concrete LLM models and endpoints, available credentials and inference budget. Choosing free sports data does not imply that every LLM provider is free.
- Domain, site owner information and the configuration needed to publish and enable AdSense.
