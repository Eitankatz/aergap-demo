// Owner-principal API calls against AGENT_SERVER_URL — the SAME endpoints the
// owner-scripts use (approve / deny / revoke). Requests go through the Vite
// proxy at same-origin /owner -> AGENT_SERVER_URL (e.g. the stub on :9740, or
// the live server after the Stage-2 swap). The operator is a separate principal
// from the agent: every call carries X-Aergap-Principal: owner.

const hdrs = (token) => ({
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'X-Aergap-Principal': 'owner',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

async function post(path, body, token) {
  const r = await fetch(`/owner${path}`, { method: 'POST', headers: hdrs(token), body: JSON.stringify(body || {}) })
  if (!r.ok) throw new Error(`POST ${path} -> HTTP ${r.status}`)
  return r.json().catch(() => ({}))
}

// EP_PENDING / EP_APPROVE / EP_DENY / EP_REVOKE — mirror owner-scripts/common.sh.
export async function fetchPending(token) {
  const r = await fetch('/owner/mandates?state=pending_owner_approval', { headers: hdrs(token) })
  if (!r.ok) throw new Error(`GET pending -> HTTP ${r.status}`)
  const j = await r.json()
  return j.items || j || []
}
export const ownerApprove = (id, token) => post(`/mandates/${encodeURIComponent(id)}/approve`, {}, token)
export const ownerDeny = (id, reason, token) => post(`/mandates/${encodeURIComponent(id)}/deny`, { reason: reason || 'owner_denied' }, token)
export const ownerRevoke = (id, reason, token) => post(`/mandates/${encodeURIComponent(id)}/revoke`, { reason: reason || 'owner_kill_switch' }, token)
