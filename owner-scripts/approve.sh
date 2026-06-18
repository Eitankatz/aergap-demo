#!/usr/bin/env bash
# Approve a parked Mandate: pending_owner_approval -> active.
# Usage: ./approve.sh <mandate-id>
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"
[[ $# -ge 1 ]] || { echo "usage: $0 <mandate-id>"; exit 2; }

echo "Owner APPROVING mandate $1 ..."
api POST "$(ep "$EP_APPROVE" "$1")" '{}' | jq '.'
