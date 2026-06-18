# owner-scripts — the OWNER principal (second terminal)

These scripts let a human **owner** act on Hermes's requests from a *separate terminal as a separate principal*. This is the demo's separation-of-principals made concrete:

| | Terminal 1 — Hermes (agent) | Terminal 2 — Owner (these scripts) |
|---|---|---|
| Identity | agent token | **separate** owner token (`AGENT_OWNER_API_TOKEN`) |
| Surface | the 5 MCP tools only | owner-facing API: approve / deny / revoke / unfreeze |
| Can approve a Mandate? | **No** — no such tool exists | Yes |
| Can sign? | No (holds no key) | No (owners authorize; AERKey signs) |

The agent **cannot** approve its own Mandate: there is no MCP tool for it, and the owner endpoints reject the agent token. The split is demonstrated, not asserted.

## Setup

```bash
cp .env.example .env
# edit .env: set AGENT_OWNER_API_TOKEN to the OWNER token (must differ from the agent token)
chmod +x *.sh          # if not already executable
```

`AGENT_SERVER_URL` defaults to `http://localhost:9740` — the SSH-tunneled local port that forwards to the live server at `54.81.244.238:9740`. Bring the tunnel up first (see [../WIRING.md](../WIRING.md)).

## Commands

| Script | Action | State transition |
|---|---|---|
| `./pending.sh` | List Mandates awaiting owner decision | — |
| `./mandate.sh <id>` | Read one Mandate (scope, caps, state, policy hash) | — |
| `./approve.sh <id>` | Approve a parked Mandate | pending_owner_approval → active |
| `./deny.sh <id> [reason]` | Deny (final) | pending_owner_approval → revoked |
| `./revoke.sh <id> [reason]` | Kill-switch | any live state → revoked |
| `./unfreeze.sh <id>` | Clear a risk-brake auto-pause | suspended → active |
| `./audit.sh [id]` | Tamper-evident audit replay (owner-side) — **pending live endpoint** | — |

> **Why audit replay is an owner command, not an agent one:** the agent writes no audit record — the rails anchor every event. Pulling the replay from the owner terminal proves the agent cannot edit the record it's judged by. This is Scene 5's replay. `audit.sh` is a placeholder until the live server's audit endpoint is confirmed.

## Demo flow (where the owner steps in)

- **Scene 1 (onboarding):** Hermes proposes a Payer Mandate → `./pending.sh` → `./approve.sh <id>` → Mandate goes active.
- **Scene 3 (escalation & approval):** the USD 40 request returns `requires_owner_approval` and parks → owner sees it via `./pending.sh` → `./approve.sh <id>` (or `./deny.sh`).
- **Scene 5 (kill switch & audit replay):** owner ends it — `./revoke.sh <id> "demo kill switch"` → Mandate revoked, wallet returns to dormant.
- **Backup (sanctions terminal):** demonstrates the owner is *powerless* on the risk plane — `./approve.sh` cannot move a sanctions-blocked payment. See [../DEMO-RUNBOOK.md](../DEMO-RUNBOOK.md) §6.

## ⚠️ Verify before the live demo

The endpoint paths in `common.sh` (`EP_APPROVE`, `EP_DENY`, …) are the spec's owner actions, but the **exact routes/verbs come from the StablePro Wallet Agent Server** and must be confirmed against the live server when wiring. Override any of them in `.env` without editing the scripts (e.g. `EP_APPROVE=/v1/mandates/{id}:approve`).
