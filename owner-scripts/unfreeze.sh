#!/usr/bin/env bash
# Unfreeze a Mandate auto-paused by a risk brake: suspended -> active.
# Only the owner can do this; the agent cannot self-unfreeze.
# Usage: ./unfreeze.sh <mandate-id>
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"
[[ $# -ge 1 ]] || { echo "usage: $0 <mandate-id>"; exit 2; }

echo "Owner UNFREEZING mandate $1 (suspended -> active) ..."
api POST "$(ep "$EP_UNFREEZE" "$1")" '{}' | jq '.'
