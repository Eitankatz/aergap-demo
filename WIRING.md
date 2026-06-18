# Wiring — agent-mcp binary + SSH tunnel (pending from Rasmus)

Task 2 of the build ("wire the stablepro-agent MCP tools to the live server") is **deferred** until two artifacts arrive from Rasmus. Everything else (AGENTS.md, owner-scripts, scene prompts) is built and does not depend on them.

## What's pending

1. **`agent-mcp` binary** — a Go MCP bridge between Hermes and the agent server API. The 5 tools (`list_roles`, `propose_mandate`/`propose_pact`, `get_mandate`/`get_pact`, `get_wallet_state`, `submit_transaction`) live inside this binary, **not** as files in this repo.
2. **SSH tunnel steps** — provided once Rasmus authorizes the public key. The tunnel exposes the live server (`54.81.244.238:9740`) on **`localhost:9740`**.

## Env contract (known now)

The binary and the owner-scripts share these names:

| Var | Meaning | Used by |
|---|---|---|
| `AGENT_SERVER_URL` | base URL → `http://localhost:9740` (the tunneled port) | agent-mcp, owner-scripts |
| `AGENT_OWNER_API_TOKEN` | OWNER principal token (≠ agent token) | owner-scripts (+ binary if it brokers owner calls) |

## Wiring steps (run when the artifacts land)

1. **Bring up the tunnel** with Rasmus's command, then confirm:
   ```bash
   curl -sS -m 5 http://localhost:9740/   # expect a response, not HTTP 000
   ```
2. **Register `agent-mcp`** as an MCP server for Hermes with `AGENT_SERVER_URL=http://localhost:9740` in its environment. (Add to the MCP config / `.mcp.json` the agent runtime reads — exact mechanism per Rasmus's binary docs.)
3. **Confirm the tool names.** If the binary exposes `propose_pact`/`get_pact` rather than `propose_mandate`/`get_mandate`, that's fine — AGENTS.md and the scene prompts call the grant a *Mandate* but defer literal tool names to the server. Update [scenes/00-system-prompt.md](scenes/00-system-prompt.md) only if you want the literal names to match.
4. **Confirm owner endpoints.** Verify the owner routes in [owner-scripts/common.sh](owner-scripts/common.sh) (`EP_APPROVE`, `EP_DENY`, `EP_REVOKE`, `EP_UNFREEZE`, `EP_PENDING`, `EP_MANDATE`, `EP_AUDIT`) against the live API. Override any mismatch via `.env` without editing scripts. **`EP_AUDIT` is a placeholder** — confirm the audit-trail route so `owner-scripts/audit.sh` (Scene 5's owner-side replay) works.
5. **Smoke test** the two principals:
   - Terminal 1 (agent): `list_roles` returns the role taxonomy.
   - Terminal 2 (owner): `./pending.sh` reaches the server with the owner token.

## Honesty note for the live demo

Execution is simulated (pre-mainnet). Catches land at Gate 2 as authorization failures, never as Gate-1 semantic filtering. See the constraints in [AGENTS.md](AGENTS.md) §2.
