#!/bin/sh
# Legacy content model ids. The agent reads GOATLAB_AGENT_MODELS via model-config.mjs.
export OPENCODE_GO_MODEL="${OPENCODE_GO_MODEL:-deepseek-v4.1-flash}"
export OPENCODE_GO_FALLBACK_MODEL="${OPENCODE_GO_FALLBACK_MODEL:-mimo-v2.6-flash}"

exec node /home/node/runtime.mjs
