// Dashboard API client (read-only). All requests go through the Vite proxy at
// same-origin /api -> the hermes dashboard.

// Resolve a session token for loopback auth, in order:
//   1) explicit token (settings field / VITE_SESSION_TOKEN)
//   2) auto-scrape window.__HERMES_SESSION_TOKEN__ from the proxied SPA index
// (Gated/public binds don't inject the token; use the ws-ticket flow instead.)
export async function resolveToken(explicit) {
  if (explicit && explicit.trim()) return explicit.trim()
  try {
    // /__dash/ proxies to the dashboard root, which injects the token in loopback mode.
    const html = await (await fetch('/__dash/', { headers: { Accept: 'text/html' } })).text()
    const m = html.match(/__HERMES_SESSION_TOKEN__\s*=\s*"([^"]+)"/)
    if (m) return m[1]
  } catch { /* ignore */ }
  return ''
}

export async function fetchMessages(sessionId, token) {
  const r = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!r.ok) throw new Error(`GET /messages -> HTTP ${r.status}`)
  return r.json()
}

export async function listSessions(token) {
  const r = await fetch('/api/sessions', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!r.ok) throw new Error(`GET /sessions -> HTTP ${r.status}`)
  return r.json()
}

// Mint a single-use ws-ticket (gated/public binds). Returns '' if unavailable
// (e.g. loopback mode, where there is no OAuth session and we use ?token=).
export async function mintWsTicket(token) {
  try {
    const r = await fetch('/api/auth/ws-ticket', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!r.ok) return ''
    const j = await r.json()
    return j.ticket || ''
  } catch { return '' }
}

// Open the /api/events WebSocket. Prefers the ws-ticket flow; falls back to the
// loopback ?token= query. channel=all receives every session; we filter by
// session_id client-side. Returns the WebSocket.
export async function openEvents({ token, channel = 'all', onFrame, onState }) {
  const ticket = await mintWsTicket(token)
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const cred = ticket ? `ticket=${encodeURIComponent(ticket)}` : `token=${encodeURIComponent(token)}`
  const url = `${proto}://${location.host}/api/events?${cred}&channel=${encodeURIComponent(channel)}`
  onState?.(ticket ? 'connecting (ticket)…' : 'connecting (token)…')

  const ws = new WebSocket(url)
  ws.onopen = () => onState?.('live')
  ws.onclose = (e) => onState?.(`closed (${e.code})`)
  ws.onerror = () => onState?.('error')
  ws.onmessage = (ev) => {
    // Frames are newline-framed JSON-RPC notifications; handle 1+ per message.
    for (const line of String(ev.data).split('\n')) {
      const s = line.trim()
      if (!s) continue
      try { onFrame?.(JSON.parse(s)) } catch { /* skip non-JSON */ }
    }
  }
  return ws
}
