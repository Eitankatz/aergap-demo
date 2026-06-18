#!/usr/bin/env bash
# Shared helpers for the OWNER principal.
#
# Principal separation is the whole point of this folder:
#   - Terminal 1 runs HERMES (the agent). It authenticates with the AGENT token
#     and can only call the 5 MCP tools. It has NO approval power.
#   - Terminal 2 (these scripts) runs the OWNER. It authenticates with a SEPARATE
#     OWNER token against the owner-facing API. Approve / deny / revoke / unfreeze
#     live here and nowhere in the agent's surface.
#
# The agent cannot approve its own Mandate: there is no MCP tool for it, and these
# endpoints reject the agent token. That separation is demonstrated, not asserted.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load env (.env next to these scripts). Copy .env.example -> .env and fill in.
if [[ -f "$HERE/.env" ]]; then
  set -a; . "$HERE/.env"; set +a
fi

# Canonical env contract — same names the agent-mcp binary uses, so the whole
# demo shares one .env. AGENT_SERVER_URL = base URL; AGENT_OWNER_API_TOKEN = owner token.
: "${AGENT_SERVER_URL:=http://localhost:9740}"   # tunneled localhost -> 54.81.244.238:9740
: "${AGENT_OWNER_API_TOKEN:?Set AGENT_OWNER_API_TOKEN in owner-scripts/.env (the OWNER principal token, NOT the agent token)}"

OWNER_API_BASE="$AGENT_SERVER_URL"
OWNER_API_TOKEN="$AGENT_OWNER_API_TOKEN"

command -v jq >/dev/null 2>&1 || { echo "jq is required (brew install jq)"; exit 1; }

# ---------------------------------------------------------------------------
# Owner-facing endpoint paths. VERIFY THESE AGAINST THE LIVE SERVER before the
# demo — they are the spec's owner actions, but the exact routes/verbs come from
# the StablePro Wallet Agent Server and must be confirmed when wiring.
#
# NOTE: the routes carrying "{id}" must NOT use ${VAR:=default}, because the "}"
# in "{id}" prematurely closes the parameter expansion (the default would become
# ".../{id"). Use defep, which assigns a literal (brace-safe) default only when
# the var is unset — so a .env override still wins.
# ---------------------------------------------------------------------------
defep() { local n="$1" d="$2"; [[ -n "${!n:-}" ]] || printf -v "$n" '%s' "$d"; }

: "${EP_PENDING:=/owner/mandates?state=pending_owner_approval}"  # GET parked approvals
: "${EP_MANDATE:=/owner/mandates}"                               # GET  /owner/mandates/{id}
defep EP_APPROVE  '/owner/mandates/{id}/approve'                 # POST -> active
defep EP_DENY     '/owner/mandates/{id}/deny'                    # POST {reason} -> revoked
defep EP_REVOKE   '/owner/mandates/{id}/revoke'                  # POST kill-switch -> revoked
defep EP_UNFREEZE '/owner/mandates/{id}/unfreeze'                # POST suspended -> active
: "${EP_AUDIT:=/owner/audit}"                                    # GET tamper-evident audit trail (served by the stub; confirm on live server)

# api METHOD PATH [json-body]
api() {
  local method="$1" path="$2" body="${3:-}"
  local url="${OWNER_API_BASE}${path}"
  local args=(-sS -X "$method" "$url"
    -H "Authorization: Bearer ${OWNER_API_TOKEN}"
    -H "X-Aergap-Principal: owner"
    -H "Accept: application/json")
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi
  curl "${args[@]}"
}

# resolve "{id}" placeholder in an endpoint template
ep() { echo "${1//\{id\}/$2}"; }
