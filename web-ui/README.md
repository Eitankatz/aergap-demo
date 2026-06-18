# web-ui — read-only Hermes-on-Aergap policy view

A minimal Vite client that renders, side by side:

- **Left — Hermes chat**, styled as hermes-agent (gold on black): user turns, assistant text, and tool-call chips.
- **Right — Aergap policy & audit**: for every evaluated `submit_transaction`, the demo **triptych** — *intent · policy evaluation (outcome + reason + control) · audit record (policy_hash, plan_hash, audit_seq, tx/ticket ids)* — plus a running audit trail.

It is **read-only**: it only GETs `/api/sessions/{id}/messages` and subscribes to the `/api/events` WebSocket. It never submits or approves anything.

## Run

```bash
cd aergap-demo/web-ui
npm install
npm run dev            # http://localhost:5180
```

Three modes (top bar):

| Mode | Source | Auth |
|---|---|---|
| **Sample (offline)** | bundled 5-scene transcript using the stub's real `submit_transaction` bodies | none — works with nothing else running |
| **Replay (session)** | `GET /api/sessions/{id}/messages` | dashboard session token |
| **Live (WebSocket)** | `/api/events` stream | ws-ticket (gated) → falls back to `?token=` (loopback) |

Start in **Sample** to see the panel mapping immediately. For Replay/Live, start the dashboard first:

```bash
HERMES_DASHBOARD_TUI=1 hermes dashboard --tui --no-open      # 127.0.0.1:9119
```

The UI proxies `/api` (HTTP + WS) to the dashboard (see `vite.config.js`), so the browser stays same-origin — no CORS, and the dashboard's loopback host/origin checks pass. Override the target with `DASHBOARD_URL` in `.env.local`.

### Auth

In **loopback** mode the dashboard injects a session token into its SPA; this UI auto-scrapes `window.__HERMES_SESSION_TOKEN__` from the proxied index, so the **token field can stay blank**. To pin it, start the dashboard with `HERMES_DASHBOARD_SESSION_TOKEN=<token>` and paste the same value. For **gated/public** binds the UI mints a single-use ticket via `POST /api/auth/ws-ticket` and connects with `?ticket=`.

## How it maps the data

Confirmed against the live dashboard:

- **Messages** (`/api/sessions/{id}/messages`): assistant turns carry `tool_calls[].function.{name,arguments}`; the paired `{role:"tool", tool_call_id, tool_name, content}` carries the result as a **JSON string**. The UI pairs them by `tool_call_id`, parses the result, and classifies by shape (`outcome` → policy decision; `active_mandate_id`/`state` → wallet; `scope` → mandate).
- **Events** (`/api/events`): JSON-RPC notifications `{method:"event", params:{type, session_id, payload}}`. Handled types: `message.start|delta|complete`, `thinking.delta`, `reasoning.available`, `tool.start|complete`, `status.update`, `error`. A policy decision is read from `tool.complete`'s `payload.result_text`.

The policy fields mapped: `outcome` (`accept` / `deny` / `requires_owner_approval`), `reason`, `control`, `policy_hash`, `plan_hash`, `audit_seq`, `tx_id`, `ticket_id`, `approval_id`, and flags (`confused_deputy`, `terminal`/`override_allowed`, `simulated`).

## Status / caveat

Until Rasmus's `agent-mcp` binary is wired, **no real `submit_transaction` tool_result exists in any Hermes session** (live/replay will show whatever tools the agent actually called). The **Sample** mode reproduces the five-scene triptych from the stub's verified bodies so the view is demonstrable today. Tool-name detection is shape-based, so it works whether the live tool is `submit_transaction` or `propose_pact`/etc.
