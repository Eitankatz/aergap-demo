# Wiring — local stub (default) + agent-mcp binary / SSH tunnel (real server)

There are two backends, both on `localhost:9740`:

- **Local stub (default):** [`stub-server/`](stub-server/) — a dependency-free Node server that mimics the StablePro agent server faithfully enough to run all five scenes offline. **No tunnel, no binary, no live server needed.** Use this for dry runs and rehearsal.
- **Real server:** Rasmus's `agent-mcp` binary + an SSH tunnel to `54.81.244.238:9740`. Still **pending** the two artifacts below.

Because both bind the same port, `AGENT_SERVER_URL=http://localhost:9740` is correct for either — the only switch is which process owns `localhost:9740`.

## Local runs — the stub is the default

```bash
cd aergap-demo/stub-server && ./start.sh      # serves localhost:9740 (or: npm start)
curl -sS http://localhost:9740/               # health check -> {"mode":"STUB","status":"ok",...}
```

The stub ports the `payer.v1` mock policy engine (per-tx cap USD 5, owner approval at USD 25, `acme-coffee` allowlisted, `sanctioned-addr` blocklisted) and the three outcomes (`accept` / `deny` / `requires_owner_approval`). It enforces principal separation: `/owner/*` requires the owner token, so the agent token is rejected there. It also serves `/owner/audit`, so Scene 5's owner-side replay works locally. See [stub-server/README.md](stub-server/README.md) for routes, config, and the scene-by-scene outcome table.

Point the two principals at it (defaults already match):
- agent-mcp env: `AGENT_SERVER_URL=http://localhost:9740`, `AGENT_API_TOKEN=demo-agent-token`
- `owner-scripts/.env`: `AGENT_SERVER_URL=http://localhost:9740`, `AGENT_OWNER_API_TOKEN=demo-owner-token`

## Swap to the real server (one line)

Stop the stub, then bring up the tunnel on the same port — nothing else changes:

```bash
ssh -N -L 9740:localhost:9740 <user>@54.81.244.238   # Rasmus's exact command, pending
```

If the live server differs, override in `owner-scripts/.env` (and the agent-mcp env) without editing scripts — e.g. `AGENT_SERVER_URL=...`, `EP_APPROVE=/v1/mandates/{id}:approve`.

---

## Real-server artifacts still pending from Rasmus

Task 2 ("wire the stablepro-agent MCP tools to the **live** server") is **deferred** until two artifacts arrive. The stub above covers local runs in the meantime; AGENTS.md, owner-scripts, and scene prompts do not depend on either artifact.

## What's pending

1. **`agent-mcp` binary** — a Go MCP bridge between Hermes and the agent server API. The 5 tools (`list_roles`, `propose_mandate`/`propose_pact`, `get_mandate`/`get_pact`, `get_wallet_state`, `submit_transaction`) live inside this binary, **not** as files in this repo.
2. **SSH tunnel steps** — provided once Rasmus authorizes the public key. The tunnel exposes the live server (`54.81.244.238:9740`) on **`localhost:9740`**.

## Env contract (known now)

The binary, the owner-scripts, and the stub all share these names:

| Var | Meaning | Used by |
|---|---|---|
| `AGENT_SERVER_URL` | base URL → `http://localhost:9740` (stub or tunneled port) | agent-mcp, owner-scripts |
| `AGENT_API_TOKEN` | AGENT principal token | agent-mcp, stub |
| `AGENT_OWNER_API_TOKEN` | OWNER principal token (≠ agent token) | owner-scripts, stub (+ binary if it brokers owner calls) |

## Wiring steps (run when the artifacts land)

1. **Bring up the tunnel** with Rasmus's command, then confirm:
   ```bash
   curl -sS -m 5 http://localhost:9740/   # expect a response, not HTTP 000
   ```
2. **Register `agent-mcp`** as an MCP server for Hermes with `AGENT_SERVER_URL=http://localhost:9740` in its environment. (Add to the MCP config / `.mcp.json` the agent runtime reads — exact mechanism per Rasmus's binary docs.)
3. **Confirm the tool names.** If the binary exposes `propose_pact`/`get_pact` rather than `propose_mandate`/`get_mandate`, that's fine — AGENTS.md and the scene prompts call the grant a *Mandate* but defer literal tool names to the server. Update [scenes/00-system-prompt.md](scenes/00-system-prompt.md) only if you want the literal names to match.
4. **Confirm owner endpoints.** The owner routes in [owner-scripts/common.sh](owner-scripts/common.sh) (`EP_APPROVE`, `EP_DENY`, `EP_REVOKE`, `EP_UNFREEZE`, `EP_PENDING`, `EP_MANDATE`, `EP_AUDIT`) are exercised and working against the stub — verify they match the **live** API and override any mismatch via `.env` without editing scripts. `EP_AUDIT` (`/owner/audit`) is served by the stub for Scene 5's owner-side replay; confirm the real audit-trail route on the live server.
5. **Smoke test** the two principals:
   - Terminal 1 (agent): `list_roles` returns the role taxonomy.
   - Terminal 2 (owner): `./pending.sh` reaches the server with the owner token.

## Honesty note for the live demo

Execution is simulated (pre-mainnet). Catches land at Gate 2 as authorization failures, never as Gate-1 semantic filtering. See the constraints in [AGENTS.md](AGENTS.md) §2.
