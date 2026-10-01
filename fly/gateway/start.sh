#!/bin/sh
# OpenCode Go model ids. A Fly secret overrides the default; with no secret
# the gateway keeps today's models.
export OPENCODE_GO_MODEL="${OPENCODE_GO_MODEL:-mimo-v2.6-flash-free}"
export OPENCODE_GO_FALLBACK_MODEL="${OPENCODE_GO_FALLBACK_MODEL:-space-bunny-free}"

nginx
node /home/node/idle-stop.mjs &
exec node dist/index.js gateway --port 3001 --bind lan
