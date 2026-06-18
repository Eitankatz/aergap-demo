# Demo Operational Architecture

Last updated: 2026-06-18

The mock (aergap-flagship.html) retires as the hero. The new hero is a real agent running in its native environment, governed by Aergap shown in separate, branded surfaces.

## The core idea

Three parties, three surfaces. The separation is the pitch.

1. The agent, in its native Hermes environment. The agent's own world. Hermes today, any agent harness later.
2. The Aergap dashboard. The trust fabric watching every action: policy evaluation, verdict, audit trail. Aergap branding, distinct from Hermes.
3. The operator surface. Where a human approves, denies, or kills. A separate principal. The agent cannot act here.

## The three panes

Pane 1, the agent. The real `hermes chat` TUI in a terminal, genuinely Hermes, for maximum authenticity. A browser-embedded chat is the alternative for polish over authenticity. Both stay available; the audience decides.

Pane 2, the Aergap dashboard. The rebranded web-ui console. Cyan trust-fabric palette on dark slate, Aergap wordmark, not Hermes gold. Shows intent, policy evaluation, the three outcomes, and the audit record. Reads the live event stream so it reacts as the agent runs.

Pane 3, the operator. A floating phone-style surface, reused from the mock pattern, branded Aergap. Approve, Deny, Kill. The buttons call the same owner endpoints the owner-scripts use. The raw owner-scripts terminal stays as the power-user fallback.

## The operating model

Drive the agent in Pane 1. Each action streams into the Aergap dashboard in Pane 2, where the verdict and audit appear. When a scene needs a human, the request surfaces on the operator phone in Pane 3. Tap Approve or Kill. The agent continues or stops. Three windows, one story.

## Brand separation

Only the agent is Hermes gold-on-black. Every Aergap surface (dashboard and operator phone) uses the Aergap palette from aergap-flagship.html: cyan primary, green accept, red deny, dark slate canvas, Aergap wordmark. One glance should read as two products: an independent agent, governed by Aergap.

## Roadmap

Stage 1, now. Build the full version for Eitan. Real Hermes plus rebranded Aergap dashboard plus operator phone, running against the stub. This is the working demo.

Stage 2, when Rasmus delivers the agent-mcp binary. Swap the stub for the live server. One line. The dashboard goes truly live.

Stage 3, SDR enablement. The 90-second video first, so SDRs can sell while we simplify. Then a one-command, one-tab packaged version they run themselves: a single launch script starts everything and prints one URL.

## The SDR replication principle (Stage 3 target)

Three terminals plus a web app is too much for an SDR to set up live. The Stage 3 target is one command and one browser tab. A single `demo-up.sh` starts the stub, the Hermes dashboard, and the Aergap web-ui, then prints one URL. Until then, SDRs use the video.

## Honest constraint

Pane 2 going fully live needs Rasmus's binary, because real transaction events flow through it. Until then, Pane 1 is real and Panes 2 and 3 run against the stub. Fine for a pitch, and the wiring is already correct for the swap.
