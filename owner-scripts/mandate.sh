#!/usr/bin/env bash
# Read one Mandate: scope, caps, state, counters, policy hash.
# Usage: ./mandate.sh <mandate-id>
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"
[[ $# -ge 1 ]] || { echo "usage: $0 <mandate-id>"; exit 2; }

api GET "$EP_MANDATE/$1" | jq '.'
