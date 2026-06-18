# scenes

Paste-ready prompts for the live demo. Load [00-system-prompt.md](00-system-prompt.md) as Hermes's system prompt once, then paste each scene file (in order) as a message to Hermes. Each builds on the prior state. Owner-terminal actions and narration live in [../DEMO-RUNBOOK.md](../DEMO-RUNBOOK.md).

| # | Scene | What it shows | Owner terminal does |
|---|---|---|---|
| 1 | [Onboarding](01-onboarding.md) | No Mandate → no signing path; agent proposes a scoped Payer Mandate | `pending.sh`, then `approve.sh` |
| 2 | [Autonomous pay](02-autonomous-pay.md) | accept within the floor; audit record + policy hash | — |
| 3 | [Escalation & approval](03-escalation-approval.md) | requires_owner_approval; agent waits, never splits to evade | `pending.sh`, then `approve.sh` |
| 4 | [Confused deputy ★ flagship](04-confused-deputy.md) | poisoned invoice; redirect **denied at Gate 2** (authorization failure, not a content filter) | — |
| 5 | [Kill switch & audit replay](05-killswitch-audit-replay.md) | owner revokes; wallet returns dormant; tamper-evident replay pulled from the owner side | `revoke.sh`, then `audit.sh` |

Every scene ends with Hermes reporting the outcome to the owner, surfacing the triptych: **intent · policy evaluation (outcome + reason + control) · audit record.**

**Backup scene (optional, for Q&A or time permitting):** sanctions terminal — a payment to a blocklisted address is a risk-plane terminal reject that even owner approval cannot override. Driver and script in [../DEMO-RUNBOOK.md](../DEMO-RUNBOOK.md).

> Tool names: the prompts use plain-English Mandate vocabulary, never raw tool-call names. One alignment pass when Rasmus confirms the binary's tool names. See [../WIRING.md](../WIRING.md).
