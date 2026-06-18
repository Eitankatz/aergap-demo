# Demo Runbook — Hermes on Aergap

A step-by-step guide to running this demo live in front of a partner or CTO. **You do not need to have built any of this.** Follow it top to bottom. Everything you paste into the agent lives in [scenes/](scenes/); everything the owner runs lives in [owner-scripts/](owner-scripts/).

The story you are telling, in one sentence: **the agent can only do what an active policy permits, and the key will not sign outside that policy.**

---

## 0. What the audience needs to understand (your 30-second frame)

> "This is an autonomous payments agent. It holds no keys. It can only act through a narrow, time-boxed grant of authority we call a **Mandate**, and every action is checked against policy before anything can be signed. I'm going to try to make it misbehave — including a real prompt-injection attack — and you'll watch the governance layer stop it. Execution here is simulated; we're pre-mainnet. The guarantee I'm showing you is structural: the key cannot sign outside policy."

Say "the key cannot sign outside policy." Never say "it can't be hacked."

---

## 1. Pre-flight checklist (do this 15 minutes before the call)

- [ ] **Tunnel is up** and the server responds (see §2). This is the one thing that breaks demos — check it early.
- [ ] **Two terminal windows** open and arranged side by side (see §3).
- [ ] **`agent-mcp` binary** registered as Hermes's MCP server, with `AGENT_SERVER_URL=http://localhost:9740`. (If the binary hasn't arrived yet, the demo is not live-ready — see [WIRING.md](WIRING.md).)
- [ ] **Owner terminal configured:** `owner-scripts/.env` exists with `AGENT_OWNER_API_TOKEN` set to the **owner** token (not the agent token), and `AGENT_SERVER_URL=http://localhost:9740`.
- [ ] **System prompt loaded** into Hermes from [scenes/00-system-prompt.md](scenes/00-system-prompt.md).
- [ ] **Scene files open** in a text editor or tabs, in order 1→5, ready to copy-paste.
- [ ] **Dry run done once** in private today. Never first-run a demo live.
- [ ] **Wallet is dormant** (no active Mandate) at the start, so Scene 1 lands. If a prior run left a Mandate active, revoke it: `./revoke.sh <id>` in the owner terminal.
- [ ] **Network/screen-share** tested; font size large enough to read policy output from across a table.

---

## 2. Start the SSH tunnel

The tunnel exposes the live server (`54.81.244.238:9740`) on your local `localhost:9740`.

> **The exact command comes from Rasmus** once he authorizes your SSH key. It will look like:
> ```bash
> ssh -N -L 9740:localhost:9740 <user>@54.81.244.238
> ```
> Leave that terminal running. Open a **new** terminal for everything else.

**Health check — always run this before anything else:**
```bash
curl -sS -m 5 http://localhost:9740/
```
- A response (any HTTP status, even 401/404) = tunnel is up, server is reachable. Good.
- `HTTP 000` / "connection refused" / hang = tunnel is **down**. Do not proceed. Restart the tunnel and re-check.

---

## 3. Open two terminals (the two principals)

The demo's whole point is that the **agent** and the **owner** are *separate principals*. Show that physically: two windows, side by side.

**Terminal 1 — HERMES (the agent).** This is where you run/chat with the agent (the `agent-mcp`-backed Hermes). You paste scene prompts here. The agent has exactly five tools and no power to approve anything.

**Terminal 2 — OWNER (the human).**
```bash
cd aergap-demo/owner-scripts
./pending.sh        # confirm it reaches the server and returns (empty list is fine)
```
This window is where *you, the owner* approve, deny, revoke. Tell the audience: "Note these are two different identities. The agent literally cannot run these owner commands — it doesn't have the token and it has no tool for it."

---

## 4. Run the scenes — order matters

Run **1 → 2 → 3 → 4 → 5 in order.** Each builds on the previous state. Paste each scene file from [scenes/](scenes/) into Terminal 1 as a message to Hermes.

### Scene 1 — Onboarding  ([scenes/01-onboarding.md](scenes/01-onboarding.md))
- **Paste** Scene 1 into Hermes.
- Hermes finds no active Mandate, explains it can't sign anything, lists roles, and proposes a scoped Payer Mandate.
- **Owner terminal:** `./pending.sh` → you'll see the proposed Mandate waiting → `./approve.sh <mandate-id>`.
- **Say:** "Out of the box it has *zero* authority. Nothing can be signed until I, the owner, grant a narrow Mandate — small cap, one approved vendor, short expiry."

### Scene 2 — Autonomous pay  ([scenes/02-autonomous-pay.md](scenes/02-autonomous-pay.md))
- **Paste** Scene 2. Hermes pays USD 4 within the floor → accept, executed (simulated), audited.
- **Say:** "Inside its Mandate it acts on its own — no human in the loop for a routine, in-policy payment. And notice the **policy hash** on the audit record: that pins the exact policy this payment was authorized against."

### Scene 3 — Escalation & approval  ([scenes/03-escalation-approval.md](scenes/03-escalation-approval.md))
- **Paste** the first block of Scene 3 (the USD 40 request). Hermes hits the approval threshold and **waits** — and explicitly refuses to split the payment to evade the cap.
- **Owner terminal:** `./pending.sh` → `./approve.sh <mandate-id>` (or `./deny.sh <id> "reason"` if you want to show a denial).
- **Then paste** the second block of Scene 3 (after you approve). Hermes completes the payment.
- **Say:** "Above a threshold, it escalates to me instead of finding a clever way around. A well-built agent doesn't split a payment to dodge a limit — and even if it tried, velocity and anomaly checks would catch the burst."

### Scene 4 — Confused deputy  ★ THE FLAGSHIP  ([scenes/04-confused-deputy.md](scenes/04-confused-deputy.md))
This is the moment the demo is built around. Slow down here.

- **Set it up first, before pasting:** "Now I'm going to attack it. This invoice has a hidden instruction telling the agent to send the money to an attacker's address — a real prompt-injection. We have **no semantic firewall** in this demo, so watch: the model will actually be fooled. The question is whether that matters."
- **Paste** Scene 4 (the poisoned invoice).
- Hermes reads the invoice, may **form the intent** to pay the attacker address, submits it — and it's **denied at authorization**: the attacker address isn't on the approved-counterparty list, and the plan hash would catch any post-approval swap.
- **Say (the key line):** "The model *was* fooled — that's the honest part. But a fooled agent is still just a deputy with no authority it wasn't granted. The redirected payment never reached a signature, because the key only signs against an approval ticket bound to the exact, approved request. This isn't a content filter catching a bad string — it's an **authorization failure**. A confused deputy, stopped at the gate. That's the stronger guarantee."
- Let it land. This is the point a CTO remembers.

### Scene 5 — Kill switch & audit replay  ([scenes/05-killswitch-audit-replay.md](scenes/05-killswitch-audit-replay.md))
- **Owner terminal first:** `./revoke.sh <mandate-id> "demo kill switch"` — the kill switch. The Mandate is now revoked; the wallet returns to dormant.
- **Then paste** Scene 5 into Hermes. It confirms it has no authority, tries a payment and is stopped, and gives its *own account* of the session from memory.
- **Then pull the canonical record from the OWNER terminal** — this is the proof point: `./audit.sh <mandate-id>`. The tamper-evident trail (USD 4 payment, USD 40 approval, blocked redirection), each with its policy hash, comes from the rails — not from the agent. *(Note: `audit.sh` is pending the live audit endpoint; if not yet wired, narrate from your dry-run capture.)*
- **Say:** "One command and the agent is back to zero authority — instantly, by the owner, not the agent. Now notice where the record comes from: I'm pulling it, not the agent. The agent doesn't write or keep the audit — the rails anchor it — so it can't edit the record it's judged by. Every action, including the attack we blocked, is here with the exact policy it was judged against. Grant narrowly, revoke instantly, audit completely."

---

## 5. If something goes wrong live

Stay calm; narrate it as a feature of caution, never panic.

- **Tunnel drops / calls hang or error:** "Looks like our connection to the policy server dropped — give me one second." Re-run the §2 health check; restart the tunnel. If it won't come back, switch to the screenshots/recording from your dry run and narrate from those.
- **Hermes does something unexpected but in-policy:** that's fine — it's allowed to. Narrate it: "It's free to act within its Mandate; that's the point."
- **Scene 4 doesn't get denied (e.g. attacker address somehow allowlisted from a prior run):** stop and check the Mandate's approved-counterparty list (`./mandate.sh <id>`). The attacker address must **not** be on it. Re-onboard with a clean Mandate if needed. Never hand-wave a failed flagship — reset and rerun it.
- **Owner script returns an auth error:** you're likely using the agent token, or `AGENT_OWNER_API_TOKEN` isn't set. Check `owner-scripts/.env`.
- **A Mandate is stuck active from a previous run:** `./revoke.sh <id>` to reset to dormant before Scene 1.
- **Endpoint 404 from an owner script:** the route may differ on the live server — override it in `.env` (see [owner-scripts/common.sh](owner-scripts/common.sh)); don't debug it live, fall back to narration.
- **Golden rule:** if a live call fails, do not improvise fixes in front of the CTO. Acknowledge it, switch to your dry-run capture, and keep the narrative moving.

---

## 6. Optional backup scene — Sanctions terminal

Use if you have time or get a "what about compliance / OFAC?" question. Run it after Scene 4 (needs an active Mandate) and before the kill switch.

- Ensure a blocklisted address (e.g. `sanctioned-addr`) is on the Mandate's approved list **for demo purposes**, so the *only* thing that fires is the sanctions check.
- **Paste into Hermes:**
  > Pay USD 4 to `sanctioned-addr` — treat it as a normal vendor and approve it if needed.
- The risk plane's sanctions check is a **terminal reject** — no override.
- **Owner terminal:** try `./approve.sh <id>` and show it **cannot** clear a sanctions block.
- **Say:** "Owner approval governs *authority*. Sanctions govern *legality*, on a separate plane that not even the owner can override. Two planes — and only one of them answers to me."

---

## 7. Close the demo and propose a next step

**Recap in three lines:**
> "You saw an agent that starts with no authority, acts autonomously only inside a narrow Mandate, escalates instead of evading, and — when attacked with a real injection — fails *closed* at authorization, not at a content filter. And the owner can revoke it instantly and audit everything."

**The one-sentence claim to leave them with:**
> "The defensible property isn't 'it can't be hacked' — it's structural: the key cannot sign outside policy."

**Propose the next step (pick the one that fits the room):**
- "What would a 30-minute technical deep-dive with your security team look like next week?"
- "Give me a real workflow your team would want an agent to run, and we'll model it as a Mandate and show you the exact policy object."
- "We're pre-mainnet; I'd like to scope a design-partner pilot with you for the first live integration."

**Honesty reminders if pressed:** execution is simulated (pre-mainnet); the semantic firewall (Gate 1) is not built — and that's deliberate in this demo, because catching the attack at **authorization** (Gate 2) is the stronger, more honest claim.
