#!/bin/sh
# OpenCode Go model ids. A Fly secret overrides the default; with no secret
# the gateway keeps today's models.
export OPENCODE_GO_MODEL="${OPENCODE_GO_MODEL:-deepseek-v4.1-flash}"
export OPENCODE_GO_FALLBACK_MODEL="${OPENCODE_GO_FALLBACK_MODEL:-mimo-v2.6-flash}"

exec node /home/node/runtime.mjs
