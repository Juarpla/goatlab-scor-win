#!/bin/sh
# OpenCode Go model ids. A Fly secret overrides the default; with no secret
# the gateway keeps today's models.
export OPENCODE_GO_MODEL="${OPENCODE_GO_MODEL:-deepseek-v4.1-flash}"
export OPENCODE_GO_FALLBACK_MODEL="${OPENCODE_GO_FALLBACK_MODEL:-mimo-v2.6-flash}"

nginx || exit 1
while true; do
  python3 "$GOATLAB_SKILL_DIR/scripts/workflow.py" supervise
  sleep 3
done &
node /home/node/idle-stop.mjs &
exec node dist/index.js gateway --port 3001 --bind lan
