# web-ui — Aergap policy dashboard (Pane 2) + operator phone (Pane 3)

The Aergap-branded console for the demo. Per [DEMO-ARCHITECTURE.md](../DEMO-ARCHITECTURE.md), the demo is **three surfaces**:

1. **Pane 1 — the agent**, in its own real Hermes window (terminal `hermes chat` or the dashboard's embedded chat). Gold-on-black, genuinely Hermes. **This UI does not touch or re-skin it.**
2. **Pane 2 — the Aergap dashboard** (this app): cyan-on-dark-slate, Aergap wordmark. Shows the agent's activity as the fabric observes it (left) and the policy triptych + audit trail (right).
3. **Pane 3 — the operator**: a floating Aergap phone (bottom-right) where a human Approves / Denies / Kills. A separate principal — the agent cannot act here.

It is **read-only** with respect to the agent: it GETs `/api/sessions/{id}/messages`, subscribes to `/api/events`, and the operator phone POSTs to the **owner** endpoints (a separate principal).

## Run

```bash
cd aergap-demo/web-ui
npm install
npm run dev            # http://localhost:5180
```

Defaults to **Sample (offline)** — the dashboard renders the five-scene triptych and the operator phone runs on seeded cards (a USD 40 approval, then an anomaly kill alert). No dashboard, stub, or tunnel required.

| Mode | Dashboard data | Operator phone |
|---|---|---|
| **Sample (offline)** | bundled 5-scene transcript | seeded approval + anomaly kill; buttons simulate locally |
| **Replay (session)** | `GET /api/sessions/{id}/messages` | idle (no live owner queue) |
| **Live (WebSocket)** | `/api/events` stream | polls `/owner/mandates?state=pending_owner_approval`; buttons POST real owner actions |

## Branding

The console uses the Aergap palette from [`../aergap-flagship.html`](../aergap-flagship.html): cyan primary `#5AA9E6`, accept `#36D399`, deny `#FF5B66`, hold `#F4B740`, on dark slate `#0A0F14`. **No Hermes gold** appears in the dashboard, audit, or trail. Drop an `aergap-logo.svg` into `web-ui/public/` to fill the wordmark's logo slot (it falls back to an `Æ` mark).

## Two backends, two proxies

The dashboard chat/events and the owner endpoints are **different origins**, so `vite.config.js` proxies both same-origin:

- `/api` (HTTP + WS) → `DASHBOARD_URL` (Hermes dashboard, default `:9119`) — agent activity + policy events.
- `/owner` → `AGENT_SERVER_URL` (agent server, default the stub `:9740`) — the operator phone's `approve` / `deny` / `revoke`, the **same routes `owner-scripts/` use**.

This keeps the browser same-origin (no CORS; passes the dashboard's loopback host/origin checks) and makes the Stage-2 swap one line: point `AGENT_SERVER_URL` at the live server (or the SSH-tunnelled port).

## Auth

- **Dashboard** (chat/events): loopback auto-scrapes `window.__HERMES_SESSION_TOKEN__`; the *dashboard token* field can stay blank. Gated binds use the `POST /api/auth/ws-ticket` → `?ticket=` flow.
- **Operator** (owner actions): the *operator token* field is the **owner** principal token (`AGENT_OWNER_API_TOKEN`) — never the agent token. Not needed in Sample mode.

## Data mapping (verified against the live dashboard)

- **Messages**: assistant `tool_calls[].function.{name,arguments}` paired by `tool_call_id` with `{role:"tool", tool_name, content}` (content is a JSON string).
- **Events**: JSON-RPC `{method:"event", params:{type, session_id, payload}}`; handled `message.start|delta|complete`, `thinking.delta`, `reasoning.available`, `tool.start|complete`, `status.update`, `error`.
- **Owner queue**: `/owner/mandates?state=pending_owner_approval` → `{items:[…]}`; actions `/owner/mandates/{id}/{approve|deny|revoke}` with `X-Aergap-Principal: owner`.

Policy results are classified by **shape** (`outcome` → decision; `state`/`active_mandate_id` → wallet; `scope` → mandate), so it works whether the live tool is `submit_transaction` or `propose_pact`/etc. Mapped fields: `outcome`, `reason`, `control`, `policy_hash`, `plan_hash`, `audit_seq`, `tx/ticket/approval` ids, flags (`confused_deputy`, `terminal`, `simulated`).

## Status / caveat

Until Rasmus's `agent-mcp` binary is wired, no real `submit_transaction` tool_result exists in any session, so Live/Replay show whatever the agent actually called. Sample mode bridges this for the pitch. Per the architecture's honest constraint: Pane 1 is real now; Panes 2 and 3 run against the stub, and the wiring is already correct for the Stage-2 swap.
