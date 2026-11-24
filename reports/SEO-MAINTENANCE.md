# Recurring SEO maintenance

`aa-seo-improvement` runs daily at 09:23 UTC (04:23 America/Lima), after successful
`1-update-data` and `5-editorial-research` runs, and manually. GitHub schedules are
best effort and can be delayed. This workflow is independent of their sequence.

## Maintenance and boundaries

The default `maintain` operation reuses the existing calendar synchronizer to
publish already validated readings to D1. It shares `goatlab-d1-calendar` with
the calendar workflow, preserves freshness guards, identity checks and editorial
indexability gates, and never invokes pruning or AI. It uses the existing
`CLOUDFLARE_ACCOUNT_ID` and `GOATLAB_D1_API_TOKEN` secrets. The manual `audit`
operation skips database writes. Neither mode commits repository changes.

The synchronizer cannot create missing analyses, solve provider outages, change
Google's ranking, or override the quality gate. A low sitemap-to-calendar ratio
is an observation, not permission to remove `noindex`.

## Verification

The audit job runs the SEO regression tests and the standard build/publication
checks, then crawls production HTML with three concurrent requests, bounded
timeouts, a six-minute audit budget and at most 200 pages / ten sitemaps.
Responses with `Retry-After` are not immediately retried. Missing coverage from
an unavailable calendar stays unknown rather than becoming a zero-match count.
The scheduled audit runs even if
maintenance or the build fails, and failed maintenance remains a workflow failure.

Checks cover robots access, required sitemap registration, HTTP status, sitemap
canonical URLs, meaningful metadata presence, duplicate metadata, empty/broken
internal links, reachability from the homepage, invalid/future `lastmod`,
accidental sitemap `noindex`, and advertising on excluded or error pages.
Production tools and machine-readable API/data URLs are omitted from the live
crawl; their search/ad exclusions remain covered by the existing build guard.

Missing structured data, weak match coverage, stale source snapshots, semantic
landmarks, potential orphans and crawl limits are observations. Fetch failures,
broken pages, conflicting sitemap indexing directives and invalid metadata fail
the job. The crawler does not execute JavaScript, inspect private Search Console
data, test image licenses, or measure Core Web Vitals. HTTP timing is diagnostic.

Each execution writes `.cache/seo/report.json` and `report.md`, appends a Spanish
Actions summary, and uploads an artifact for 60 days. An optional Actions cache
stores the previous summary for comparison; missing/expired cache is acceptable.
Reports and crawl-derived values never reach prompts, shell commands or public
site files. Failures use normal GitHub Actions status/notification preferences;
the workflow does not send email or open issues.

## Local operation

```sh
node --test tests/seo-audit.test.js
node scripts/seo-maintenance.mjs
```

The second command reads the production site and local fixture timestamp but
does not change D1 or public content. Exit status is nonzero on technical errors.
All findings, including those beyond the first 100 displayed rows, stay in JSON.
