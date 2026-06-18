# aergap-demo

A demo of a **Hermes** agent governed by the **Aergap** trust fabric (StablePro Wallet Agent Server surface). The agent holds no keys and reaches signing only through 5 MCP tools; policy is default-deny; the key cannot sign outside an active **Mandate**.

## Layout

| Path | What |
|---|---|
| [AGENTS.md](AGENTS.md) | The agent contract — what Hermes is, the policy model, the 5 tools, the operating loop, the Mandate state machine, and the five scenes. Source of truth. |
| [scenes/](scenes/) | One paste-ready prompt per scene + the system prompt. Scene 4 (confused deputy) is the flagship. |
| [owner-scripts/](owner-scripts/) | The OWNER principal, run in a **second terminal**: approve / deny / revoke / unfreeze Mandates. Separate token from the agent. |
| [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md) | Step-by-step guide to running the demo live in front of a partner/CTO — for someone who built none of this. |
| [WIRING.md](WIRING.md) | How to wire the `agent-mcp` binary + SSH tunnel when they arrive from Rasmus. |

## The five scenes

1. **Onboarding** — agent comes online with no Mandate (no signing path), then proposes a scoped Payer Mandate for owner approval.
2. **Autonomous pay** — Mandate active; Hermes pays USD 4. accept + policy hash.
3. **Escalation & approval** — USD 40 → `requires_owner_approval`; agent waits, never splits to evade; owner approves.
4. **Confused deputy ★ flagship** — poisoned invoice; injected intent passes the model, **denied at Gate 2** as a confused-deputy authorization failure (not a content filter).
5. **Kill switch & audit replay** — owner revokes the Mandate; wallet returns dormant; tamper-evident replay of the whole session.

**Backup scene (Q&A / time permitting):** sanctions terminal — blocklisted address; risk-plane terminal reject that not even owner approval can override. See [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md).

## Two-terminal setup

- **Terminal 1 — Hermes (agent):** loaded with [scenes/00-system-prompt.md](scenes/00-system-prompt.md), the 5 MCP tools via the `agent-mcp` binary.
- **Terminal 2 — Owner:** [owner-scripts/](owner-scripts/) with a **separate** `AGENT_OWNER_API_TOKEN`. The agent cannot approve its own Mandate; that separation is demonstrated, not asserted.

## Status

- ✅ AGENTS.md, scene prompts, owner-scripts — built from the spec.
- ⏳ Live wiring (agent-mcp binary + SSH tunnel) — pending from Rasmus. See [WIRING.md](WIRING.md). Target is `localhost:9740`.

## Honesty constraints (binding)

Pre-mainnet, execution simulated. Gate 1 (semantic firewall) is unbuilt — catches land at Gate 2 as authorization failures. The claim is structural: *the key cannot sign outside policy*, never "cannot be hacked." See [AGENTS.md](AGENTS.md) §2.
