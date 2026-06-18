#!/usr/bin/env bash
# Audit replay — read the tamper-evident audit trail from the OWNER side.
#
# ⚠️ PENDING THE LIVE SERVER'S AUDIT ENDPOINT. The route in EP_AUDIT (common.sh)
# is a placeholder; confirm the real path/query when Rasmus delivers the binary,
# then override via .env if it differs (e.g. EP_AUDIT=/v1/audit/events).
#
# Why this lives on the OWNER side, not the agent:
#   The agent holds no key and WRITES NO AUDIT RECORD — the rails anchor every
#   event. Pulling the canonical, tamper-evident replay from the owner terminal
#   (a separate principal) is the point: the agent cannot write or edit the
#   record it is being judged by. Scene 5's replay should be shown from here.
#
# Usage:
#   ./audit.sh                 # full trail the owner token can see
#   ./audit.sh <mandate-id>    # filter to one Mandate
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

path="$EP_AUDIT"
if [[ $# -ge 1 ]]; then
  # append a mandate filter; adjust the query param name once the route is confirmed
  sep="?"; [[ "$path" == *"?"* ]] && sep="&"
  path="${path}${sep}mandate_id=$1"
fi

echo "Audit trail @ ${OWNER_API_BASE}${path}"
echo "(NOTE: endpoint is a placeholder pending the live server — see comment in this script.)"
api GET "$path" | jq '.'
