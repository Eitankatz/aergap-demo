#!/usr/bin/env bash
# Start the local StablePro agent-server STUB on localhost:9740.
#
# This is the DEFAULT backend for local demo runs — no SSH tunnel, no live
# server required. To use the REAL server instead, do NOT run this; bring up
# Rasmus's SSH tunnel on the same port (see ../WIRING.md "Swap to the real server").
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load the stub's .env if present (STUB_PORT, AGENT_API_TOKEN, AGENT_OWNER_API_TOKEN, STUB_AUTH).
if [[ -f "$HERE/.env" ]]; then
  set -a; . "$HERE/.env"; set +a
fi

command -v node >/dev/null 2>&1 || { echo "Node.js is required (https://nodejs.org). 'node' not found on PATH."; exit 1; }

echo "Starting Aergap stub server (Ctrl-C to stop)…"
exec node "$HERE/server.js"
