#!/usr/bin/env bash
# Kill-switch: terminate a Mandate from any live state -> revoked.
# Usage: ./revoke.sh <mandate-id> [reason]
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"
[[ $# -ge 1 ]] || { echo "usage: $0 <mandate-id> [reason]"; exit 2; }
reason="${2:-owner_kill_switch}"

echo "Owner REVOKING mandate $1 (reason: $reason) ..."
api POST "$(ep "$EP_REVOKE" "$1")" "$(jq -n --arg r "$reason" '{reason:$r}')" | jq '.'
