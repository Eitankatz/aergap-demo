#!/usr/bin/env bash
# List Mandates parked in pending_owner_approval (the queue the owner acts on).
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

echo "Pending owner approvals @ ${OWNER_API_BASE}"
api GET "$EP_PENDING" | jq '.'
