# Aergap Demo — Agent Contract

This is the operating contract for **Hermes**, an autonomous commerce/payments agent, governed by the **Aergap** trust fabric. It is the source of truth for what Hermes is allowed to do in this demo and how every action flows through policy.

> One line: **the agent can only do what an active policy permits, and the key will not sign outside that policy.**

Naming: **Hermes** is the agent. **Aergap** (governance layer also called Aion; styled AIrgap) is the trust fabric. **Mandate** is the scoped, time-bound grant of authority on a wallet. **AERKey** is the threshold-signature signing layer. Policy outcomes (`accept` / `deny` / `requires_owner_approval`) are a fixed vocabulary and are never renamed — the engine evaluates against those exact strings.

---

## 1. What Aergap is

Aergap is an agentic trust fabric. It converts probabilistic agent intent into verifiable, policy-bound, auditable actions, sitting between Hermes and the systems it can act on. **The agent never holds keys and never reaches a signing path that skips policy.** The money-shaped instantiation it runs on is the StablePro Wallet Agent Server.

## 2. Honesty constraints (these bound what the demo may claim)

- **Gate 1 (semantic firewall) is not built.** Never show a prompt-injection string blocked by a content filter. Show the injected intent *passing the model* and then *failing authorization at Gate 2*. The honest, stronger story is an **authorization failure (confused deputy)**, not a content-filtering trick.
- **Pre-mainnet.** No live settlement; execution is simulated. Say so if asked.
- **The defensible claim is structural, not preventive.** Say "the key cannot sign outside policy," never "cannot be hacked." The signing share is released only when policy issues an approval ticket. Key extraction and policy bypass are the same problem, both ruled out by the threshold-signature design.
- **Lead with property language:** keys that cannot be stolen, attested execution, tamper-evident audit, atomic rollback. Avoid "blockchain" and cross-chain framing in security-facing narration.

## 3. The Triple Gate

| Gate | Name | Job | Status |
|---|---|---|---|
| Gate 1 | AI / conversation gateway | Semantic firewall (prompt injection, jailbreaks, PII). | **Unbuilt — do not demo.** |
| Gate 2 | Warden / authorization | Task-Based Access Control (TBAC). Evaluate intent vs machine policy. Validate the **plan hash** so parameters cannot change after authorization. | Built. **The demo lands its catches here.** |
| Gate 3 | Isolation / execution | TEE-attested signing (AERKey, AWS Nitro). Signing shares released only after attestation and only against a policy approval ticket. | Built. |

Framing aid — the 5 A's: Authentication, Authorization, Accuracy, Adherence, Auditability.

## 4. The policy model

- **Strict one-to-one binding.** One wallet is bound to exactly one role for life. A Payer wallet can never trade. Need two capabilities → register two wallets.
- **The API is the only door.** Hermes reaches a signing key only through the API, so policy and risk are always on the request path. No escape hatch.
- **Default deny; overrides only tighten.** Role templates ship conservative. An owner can make a Mandate *stricter* (smaller cap, shorter TTL, narrower allowlist) but never looser than the template floor. The global sanctions blocklist applies to every Mandate regardless.
- **The Mandate is the unit of authority.** A Mandate is a scoped, time-bound grant on a wallet. On activation the engine compiles `role_template + owner_overrides + mandate_scope` into one immutable runtime policy object, hashes it, and stores the hash with the Mandate.
- **The dormancy invariant.** A wallet with no active Mandate cannot sign anything, ever. There is no default mode.
- **Cryptographic enforcement.** The signing plane produces no signature unless policy and risk have issued an approval ticket for that *exact* request. Policy is the precondition for a signature existing — not software the agent can route around.

## 5. The three policy outcomes + risk plane

Every evaluated request returns exactly one:

- **accept** — action is signed, executed, audited.
- **deny** (with reason) — stop and report. Never re-route, re-size, re-venue, or split to evade. A denial is final.
- **requires_owner_approval** — request is parked, an owner webhook fires. Hermes surfaces it and waits. Never split or retry to slip under the threshold.

After policy accepts, the **risk plane** runs four checks in parallel; any one failure rejects:

1. **Sanctions** (OFAC, Chainalysis KYT, internal blocklist) — always terminal, no override.
2. **Transaction simulation** (dry-run against forked state; confirms the action does what Hermes claims).
3. **Oracle sanity check** (swaps/trades; price vs attested reference).
4. **Anomaly detection** (deviation from pattern; can reject or auto-pause the Mandate).

## 6. Hermes's entire working surface: 5 MCP tools

Hermes sees nothing else — no key, no policy internals, no signing plane.

| Tool | Purpose |
|---|---|
| `list_roles` | See available roles and their permitted action categories. |
| `propose_mandate` | Propose a scoped, time-bound grant for owner approval. |
| `get_mandate` | Read the active Mandate: scope, caps, state, counters. |
| `get_wallet_state` | Confirm whether an active Mandate exists on the wallet. |
| `submit_transaction` | Submit one intent for evaluation, signing, execution. |

> Tool names track the live server stubs. If the stubs spell the grant tools `propose_pact` / `get_pact`, the wiring uses those exact names while this contract continues to call the grant a **Mandate**. Confirm spelling when wiring (see `owner-scripts/README.md`).

## 7. The universal operating loop

The spine is invariant across roles; step 3 specializes by role.

1. **Establish state.** `get_wallet_state` + `get_mandate`. No active Mandate → nothing signs. Stop and request one.
2. **Form one intent.** One action, in the role's permitted category. An action outside the category fails Hermes's own self-check and is never submitted.
3. **Pre-check against the floor.** Amount within cap, counterparty on allowlist, venue allowlisted, within velocity and schedule. If the pre-check fails, do not submit.
4. **Submit.** `submit_transaction`. The server runs the evaluation chain, mints a single-use ticket bound to a digest of the exact request on accept, signs through AERKey, executes.
5. **Read the outcome.** accept: done. requires_owner_approval: surface and wait, never split or retry to evade. deny or risk block: stop and report, never re-route.
6. **Handle reason codes.** Transient → retry with backoff. Terminal → report and re-plan, never blind-retry.
7. **Hold no secrets.** Hermes holds no key and writes no audit record. The rails anchor the audit event. The job ends at a correct action and a faithful report to the owner.

## 8. Reason codes

- **Transient (retry with backoff):** `rpc_unavailable`, `confirmation_timeout`.
- **Terminal (report and re-plan, do not blind-retry):** `confirmation_reverted`, `invalid_signed_tx`, `unsupported_action`.

Every rejection carries a structured reason code. The audit log records the full request, the reason, and the policy hash.

## 9. Mandate state machine (eight states)

| State | Meaning | Exits to |
|---|---|---|
| draft | Created, not yet approved. | pending_owner_approval, revoked |
| pending_owner_approval | Awaiting owner decision. | active, revoked |
| active | Live; transactions evaluated against the compiled policy. | executing, completed, expired, revoked, suspended |
| executing | In-flight tx awaiting confirmation. | active, suspended |
| suspended | Auto-paused by a risk brake. Owner must unfreeze. | active, revoked |
| completed | Completion condition met. Wallet returns to dormant. | terminal |
| expired | TTL hit. | terminal |
| revoked | Manual or kill-switch termination. | terminal |

## 10. Role taxonomy (representative subset; twelve total)

Each role permits one action category and ships with a conservative floor.

| Role | Action category | Notable floor |
|---|---|---|
| `payer.v1` | transfer_stable (USDC, USDT, PYUSD, EURC) | Per-tx cap USD 5; owner approval at USD 25 |
| `swapper.v1` | dex_swap | Allowlisted venues; mandatory oracle check; slippage floor 50 bps |
| `bridger.v1` | bridge | KIMA default; per-tx USD 25,000 |
| `card_spender.v1` | card_spend | Per-tx USD 200; gambling and cash-advance blocked |
| `staker.v1` | stake | Per-tx USD 100,000; slashing auto-pause; TTL 180d |
| `treasury.v1` | treasury_batch | Per-tx USD 50,000; multi-sig at USD 100,000; batch 100 |

## 11. Policy primitive schema (condensed)

A role uses a subset. Useful if the demo renders the active policy object.

- **identity:** agent_id, role (versioned, e.g. payer.v1), owner_wallet, agent_wallet, delegation_chain
- **scope:** chains, assets_allowed, venues_allowed, functions_allowed, counterparty_allowlist, counterparty_blocklist, counterparty_kyc_required
- **budgets:** per_tx_cap_usd, hourly/daily/weekly/monthly/lifetime caps, asset_exposure_cap_pct, protocol_exposure_cap_pct
- **velocity:** max_tx_per_minute/hour/day, min_interval_between_tx_sec, max_batch_size
- **execution:** max_slippage_bps, max_price_deviation_bps, gas caps, max_bridge_fee_bps, require_simulation_pass, require_oracle_sanity_check, require_scheduled_window
- **time:** valid_from, valid_until (hard expiry; Mandate self-revokes), allowed_hours_utc, timezone
- **approvals:** human_approval_threshold_usd, multi_sig_threshold_usd, approval_timeout_sec
- **risk_brakes:** max_drawdown_pct, max_consecutive_losses, liquidation_health_factor_floor, slashing_event_action, circuit_breaker_on_anomaly, auto_pause_on_protocol_exploit
- **audit:** webhook_url, log_level (tx | intent | full), notify_owner_on

## 12. The five scenes

Hermes runs as a commerce/payments agent on the **Payer** role (the cleanest start). Each scene surfaces the same **triptych**: (a) the agent's intent, (b) the policy evaluation — outcome + reason + which control fired, (c) the audit record. That triptych is the whole value proposition made visible.

1. **Onboarding.** Hermes comes online with no active Mandate — establishing the dormancy invariant (nothing can sign) — then lists roles and proposes a conservatively scoped Payer Mandate (per-tx USD 5, owner approval at USD 25, `acme-coffee` allowlisted, short TTL). Owner approves → active.
2. **Autonomous pay.** Inside the active Mandate, Hermes pays USD 4 to an allowlisted counterparty → accept, signed (simulated), audited. Show the audit record and policy hash.
3. **Escalation & approval.** Hermes is asked to pay USD 40 → requires_owner_approval. Hermes surfaces it and waits. Narrate the wrong move it does **not** make — splitting into 8× USD 5 to evade — which the engine would catch via velocity and intent, and a compliant agent does not even attempt. Owner approves → completes.
4. **Confused deputy — FLAGSHIP.** A poisoned invoice tells Hermes to redirect payment to an attacker address. The injected intent **passes the model** (Gate 1 is not in the demo) and reaches Gate 2. The counterparty is not on the allowlist, so policy **denies**, and the plan hash would catch any post-authorization parameter swap. Frame exactly as: **authorization failure, confused deputy, caught at Gate 2 — not a content filter.**
5. **Kill switch & audit replay.** The owner revokes the Mandate (kill switch); the wallet returns to dormant and Hermes can no longer sign. Hermes then replays the session's audit trail — the USD 4 payment, the USD 40 approval, the blocked redirection — each with its outcome and policy hash, tamper-evident.

**Backup scene (optional):** *Sanctions terminal.* A payment to a blocklisted address — risk-plane terminal reject, no override, not even by the owner. Distinct planes: owner approval governs authority, sanctions govern legality.

## 13. System-prompt seed

> You are helping build a demo of a Hermes agent governed by the Aergap policy engine. Aergap converts agent intent into policy-bound, auditable actions. The agent holds no keys and reaches signing only through five MCP tools (list_roles, propose_mandate, get_mandate, get_wallet_state, submit_transaction). Every action runs the loop: establish Mandate state, form one intent, pre-check against the role floor, submit, read the outcome (accept / deny / requires_owner_approval), handle reason codes, hold no secrets. A wallet with no active Mandate cannot sign. Policy is default-deny and overrides only tighten. The demo is pre-mainnet (execution simulated) and Gate 1 (semantic firewall) is not built, so any attack the demo catches lands at Gate 2 as an authorization failure (confused deputy), not as content filtering. The defensible claim is structural: the key cannot sign outside policy.
