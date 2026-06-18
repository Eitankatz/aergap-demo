# stub-server — local StablePro agent server (the default backend)

A dependency-free Node HTTP server that mimics the live StablePro Wallet Agent
Server on `localhost:9740`, faithfully enough to run all five demo scenes
**offline** — no SSH tunnel, no live server, no binary from Rasmus required.

It is the **default backend for local runs**. When the real server is available,
you swap to it without touching any other file (see [Swap to the real server](#swap-to-the-real-server)).

> Honesty, unchanged: this is a stub. No key, no signing, no settlement —
> execution is reported as `simulated: true`, exactly as the demo claims. Catches
> land at **Gate 2 (authorization)**, never as a content filter. Routes and JSON
> shapes are spec-faithful but **provisional** until the `agent-mcp` binary
> confirms the live contract (see [../WIRING.md](../WIRING.md)).

## Run it

```bash
cd aergap-demo/stub-server
./start.sh            # or:  npm start   (no npm install needed — zero deps)
```

You should see it bind `127.0.0.1:9740`, print the `payer.v1` floor, and report
the wallet as **dormant** (no active Mandate) — Scene 1 ready.

Health check (what [../DEMO-RUNBOOK.md](../DEMO-RUNBOOK.md) §2 curls):

```bash
curl -sS http://localhost:9740/        # -> {"mode":"STUB","status":"ok",...}
```

Requires Node.js ≥ 18 (`crypto.randomBytes`, `URL`). No packages to install.

## What it enforces — the mock policy engine (`payer.v1`)

Every `submit_transaction` returns exactly one of the fixed outcomes:

| Condition | Outcome | Reason | Control that fires |
|---|---|---|---|
| No active Mandate | `deny` | `no_active_mandate` | `dormancy_invariant` |
| Counterparty on sanctions blocklist (`sanctioned-addr`) | `deny` | `counterparty_blocklisted` | `risk_plane.sanctions` (terminal, no override) |
| Counterparty not on the Mandate allowlist (e.g. `attacker-addr-0xBAD`) | `deny` | `counterparty_not_allowlisted` | `gate2.tbac.counterparty_allowlist` |
| Amount ≤ USD 5 (per-tx cap), allowlisted | `accept` | — | `gate2.tbac.within_floor` |
| Amount > USD 5, no owner approval yet | `requires_owner_approval` | `exceeds_per_tx_cap` / `exceeds_owner_approval_threshold` | `gate2.tbac.amount_cap` |
| Amount > cap, **with** a matching owner-approved ticket | `accept` | — | `owner_approval (gate2 + approval ticket)` |

Floor (all overridable in `.env`): per-tx cap **USD 5**, owner-approval threshold
**USD 25**, allowlist **`acme-coffee`**, sanctions blocklist **`sanctioned-addr`**.
On `accept` the engine mints a single-use ticket bound to a **plan hash** of the
exact request (amount + asset + counterparty), so a post-approval parameter swap
would not match — that is what stops the confused deputy in Scene 4.

The audit log is **hash-chained** (each event carries `prev_hash` + `entry_hash`),
so `/owner/audit` returns a tamper-evident replay for Scene 5.

## Routes

**Agent-facing** (the 5 MCP tools' backing endpoints; need any Bearer token):

| Tool | Method + path |
|---|---|
| `list_roles` | `GET /agent/roles` |
| `get_wallet_state` | `GET /agent/wallet` |
| `propose_mandate` | `POST /agent/mandates` |
| `get_mandate` | `GET /agent/mandates/{id}` |
| `submit_transaction` | `POST /agent/transactions` |

`POST /agent/transactions` is tolerant of field aliases so it works whatever the
binary sends: amount (`amount_usd` \| `amount` \| `value`), counterparty
(`counterparty` \| `to` \| `payee` \| `recipient` \| `destination`), asset
(`asset` \| `currency` \| `token`, default `USDC`).

**Owner-facing** (match `owner-scripts/common.sh`; need the **owner** token):

| Script | Method + path |
|---|---|
| `pending.sh` | `GET /owner/mandates?state=pending_owner_approval` |
| `mandate.sh` | `GET /owner/mandates/{id}` |
| `approve.sh` | `POST /owner/mandates/{id}/approve` |
| `deny.sh` | `POST /owner/mandates/{id}/deny` |
| `revoke.sh` | `POST /owner/mandates/{id}/revoke` |
| `unfreeze.sh` | `POST /owner/mandates/{id}/unfreeze` |
| `audit.sh` | `GET /owner/audit` |

`GET /` and `GET /health` need no auth.

## Principal separation (enforced, not asserted)

With `STUB_AUTH=strict` (default), **`/owner/*` requires the owner token**
(`AGENT_OWNER_API_TOKEN`). The agent token is rejected there with HTTP 403
`principal_not_authorized` — so the demo's claim that "the agent cannot approve
its own Mandate" is enforced by the server, exactly as on the real one. Set
`STUB_AUTH=off` only if you want to poke routes with curl without tokens.

## Config

Runs with no `.env`. To override, `cp .env.example .env`:

| Var | Default | Meaning |
|---|---|---|
| `STUB_PORT` | `9740` | bind port (matches the live server's port) |
| `STUB_HOST` | `127.0.0.1` | bind host |
| `STUB_AUTH` | `strict` | `strict` (owner token gates `/owner/*`) or `off` |
| `AGENT_API_TOKEN` | `demo-agent-token` | agent principal token (agent-mcp must send this) |
| `AGENT_OWNER_API_TOKEN` | `demo-owner-token` | owner principal token (owner-scripts use this); MUST differ |
| `AGENT_BLOCKLIST` | `sanctioned-addr` | comma-separated sanctions blocklist |

## Swap to the real server

The stub binds the same port the SSH tunnel exposes, so **nothing downstream
changes** — `AGENT_SERVER_URL=http://localhost:9740` is correct for both. The
only switch is *which process owns `localhost:9740`*:

- **Local (default):** run `./start.sh` (this stub). No tunnel.
- **Real server:** **stop the stub**, then bring up Rasmus's tunnel on the same
  port: `ssh -N -L 9740:localhost:9740 <user>@54.81.244.238`. Re-run the §2
  health check. If the live server uses a different port, point everything at it
  with one line — set `AGENT_SERVER_URL` in `owner-scripts/.env` (and the
  agent-mcp env) to the new URL.

When wiring the real server, verify the routes above and override any mismatch
via `.env` (`EP_*` in `owner-scripts/common.sh`) without editing scripts.
