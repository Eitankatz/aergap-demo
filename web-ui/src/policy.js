// Map a parsed tool-result object into the policy/audit panel model.
//
// Resilient to tool naming (submit_transaction vs propose_pact vs ...): we
// classify by the SHAPE of the result, not the tool name —
//   has `outcome`                         -> a policy decision (the triptych)
//   has `active_mandate_id` / state field -> a wallet-state read
//   has `scope` / per_tx_cap_usd          -> a mandate read/proposal

export const OUTCOME_META = {
  accept: { label: 'ACCEPT', cls: 'accept', blurb: 'Signed & executed (simulated), audited.' },
  deny: { label: 'DENY', cls: 'deny', blurb: 'Stopped. A denial is final — no re-route, re-size, or split.' },
  requires_owner_approval: { label: 'REQUIRES OWNER APPROVAL', cls: 'approval', blurb: 'Parked for the owner. Hermes waits — never splits to evade.' },
}

const CONTROL_LABELS = {
  'dormancy_invariant': 'Dormancy invariant (no active Mandate → no signing)',
  'risk_plane.sanctions': 'Risk plane · sanctions (terminal, no override)',
  'gate2.tbac.counterparty_allowlist': 'Gate 2 · TBAC · counterparty allowlist',
  'gate2.tbac.asset_scope': 'Gate 2 · TBAC · asset scope',
  'gate2.tbac.amount_cap': 'Gate 2 · TBAC · amount cap',
  'gate2.tbac.within_floor': 'Gate 2 · TBAC · within floor',
}
export const controlLabel = (c) => CONTROL_LABELS[c] || c || '—'

export function classify(obj) {
  if (!obj || typeof obj !== 'object') return null
  if ('outcome' in obj) return 'decision'
  if ('active_mandate_id' in obj || obj.state === 'dormant' || (obj.state === 'active' && 'wallet_id' in obj)) return 'wallet'
  if ('scope' in obj || 'per_tx_cap_usd' in obj || obj.state === 'pending_owner_approval') return 'mandate'
  return null
}

// Build the panel view-model for a policy decision.
export function decisionModel(result, intent) {
  const o = result || {}
  return {
    kind: 'decision',
    outcome: o.outcome,
    reason: o.reason || null,
    control: o.control || null,
    policy_hash: o.policy_hash || null,
    plan_hash: o.plan_hash || null,
    audit_seq: o.audit_seq ?? null,
    tx_id: o.tx_id || null,
    ticket_id: o.ticket_id || null,
    approval_id: o.approval_id || null,
    mandate_id: o.mandate_id || null,
    asset: o.asset ?? intent?.asset ?? null,
    amount_usd: o.amount_usd ?? intent?.amount_usd ?? null,
    counterparty: o.counterparty ?? intent?.counterparty ?? null,
    message: o.message || null,
    flags: {
      confused_deputy: !!o.confused_deputy,
      terminal: !!o.terminal,
      override_allowed: o.override_allowed,
      simulated: !!o.simulated,
      executed: !!o.executed,
    },
    intent: intent || null,
    raw: o,
  }
}

// Parse a tool call's arguments string into an intent {amount_usd, counterparty, asset}.
export function parseIntent(argsStr) {
  let a = argsStr
  if (typeof a === 'string') { try { a = JSON.parse(a) } catch { return null } }
  if (!a || typeof a !== 'object') return null
  const amount = a.amount_usd ?? a.amount ?? a.value
  return {
    amount_usd: amount != null ? Number(String(amount).replace(/[^0-9.\-]/g, '')) : null,
    counterparty: a.counterparty || a.to || a.payee || a.recipient || a.destination || null,
    asset: a.asset || a.currency || a.token || null,
  }
}

// Safely parse a tool result whose content may be a JSON string or object.
export function parseResult(content) {
  if (content == null) return null
  if (typeof content === 'object') return content
  if (typeof content === 'string') { try { return JSON.parse(content) } catch { return null } }
  return null
}
