# Content generation — October 25, 2026

The ten Manchester United-Bournemouth scripts were tested with the local facts
and players (no probability file for that match), through the same OpenCode Go
gateway used by publishing. Test drafts were not published and did not replace
existing scripts. These are a few observations from a single match; they do not
represent a latency percentile or guarantee times for every run.

## Findings and configuration

- Both locally and in GitHub Actions, DeepSeek V4.1 Flash writes first and
  GLM-5.3-Flash remains the fallback, through `SCRIPT_PROVIDER_ORDER` and the
  generator and workflow defaults. The Fly.io model configuration keeps its
  previous values.
- Both receive `thinking.type=enabled` and `reasoning_effort=max`.
- The previous 12,000-token budget was insufficient for these tests: GLM exhausted
  even 32,768 tokens in two attempts (178 and 197 seconds).
- A GLM attempt without streaming was cut off at 301 seconds despite configuring a
  600-second timeout. The client now consumes SSE from the start and keeps a
  ten-minute deadline for the whole response, including its data.
- Up to 131,072 tokens are allowed, shared between reasoning and response; that
  ceiling is not a consumption target. Script duration limits remain: 55-100
  words, with an absolute ceiling of 110.

## Measurements

| Model and configuration | Total time | Output tokens | Validation of the ten scripts |
| --- | ---: | ---: | --- |
| DeepSeek, max, 65,536 tokens, no streaming | 80.4 s | 17,885 | Passed |
| DeepSeek, max, 65,536 tokens, no streaming | 177.8 s | 32,671 | Passed |
| DeepSeek, max, 131,072 tokens, streaming | 116.0 s | 13,128 | Passed |
| GLM, max, 131,072 tokens, streaming | 223.1 s | 19,892 | Passed after normalizing the hook |

GLM returned the hooks in their separate field; they were prepended to the
narrations with the same normalization already used by production generation. The
normalized texts keep the 110-word ceiling and pass full validation.

Output tokens include reasoning. Validation checks length, hooks, teams, player
placement, projection phrases, figures and compliance. Coherence and naturalness
were also reviewed by reading the drafts.

## Reproduction

```sh
node --env-file=.env scripts/benchmark-content-llm.mjs \
  --match=manchester-united-vs-bournemouth-2026-10-25 --runs=2
```

Drafts and metrics are left in a subdirectory of
`.cache/content-llm-benchmark/`. `--model=<id>` isolates one model and
`--max-tokens=<n>` compares a different budget. `.env` files and credentials are
not written into the results.

Maximum-effort compatibility was checked against the documentation for
[DeepSeek](https://api-docs.deepseek.com/guides/thinking_mode/),
[GLM](https://docs.z.ai/api-reference/llm/chat-completion) and the
[OpenCode Go endpoint](https://opencode.ai/v2/docs/console/go/), in addition to
the real calls.
