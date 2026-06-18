#!/usr/bin/env bash
# Deny a parked Mandate: pending_owner_approval -> revoked. A denial is final.
# Usage: ./deny.sh <mandate-id> [reason]
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"
[[ $# -ge 1 ]] || { echo "usage: $0 <mandate-id> [reason]"; exit 2; }
reason="${2:-owner_denied}"

echo "Owner DENYING mandate $1 (reason: $reason) ..."
api POST "$(ep "$EP_DENY" "$1")" "$(jq -n --arg r "$reason" '{reason:$r}')" | jq '.'
