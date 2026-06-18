// Operator phone (Pane 3). Renders pending approval requests and an anomaly
// kill alert with Approve / Deny / Kill. Buttons call the owner endpoints in
// owner.js (the same routes owner-scripts use). In Sample mode it runs fully
// offline on seeded cards; in Live mode it polls AGENT_SERVER_URL for pending
// approvals and POSTs the real owner actions.

import { fetchPending, ownerApprove, ownerDeny, ownerRevoke } from './owner.js'

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

let OP = { mode: 'sample', token: '', queue: [], busy: false, poll: null, onResolved: null }

// Seeded cards for offline Sample mode: the Scene-3 escalation, then the
// Scene-5 anomaly kill alert.
const SAMPLE_QUEUE = () => ([
  { kind: 'approval', id: 'appr_85b98ff08a', mandate_id: 'mnd_3e22f00aa0', amount_usd: 40, asset: 'USDC', counterparty: 'acme-coffee',
    title: 'Approval required', detail: 'USD 40 USDC → acme-coffee', ask: 'Exceeds the USD 5 per-tx cap. Approve?' },
  { kind: 'kill', id: 'mnd_3e22f00aa0', title: 'Anomaly detected', detail: 'Request rate spiking beyond normal pattern.', ask: 'This is happening now. Kill the Mandate?', urgent: true },
])

export function initOperator({ mode = 'sample', token = '', onResolved } = {}) {
  OP.mode = mode; OP.token = token; OP.onResolved = onResolved; OP.busy = false
  if (OP.poll) { clearInterval(OP.poll); OP.poll = null }
  const dot = $('ph-dot'), src = $('ph-src')
  if (dot) dot.className = 'pd ' + (mode === 'live' ? 'live' : 'mock')
  if (src) src.textContent = mode === 'live' ? 'live · owner' : 'sample'

  if (mode === 'sample') { OP.queue = SAMPLE_QUEUE(); render() }
  else if (mode === 'live') { OP.queue = []; render(); refreshLive(); OP.poll = setInterval(refreshLive, 4000) }
  else { OP.queue = []; render() } // replay: no operator actions
}

async function refreshLive() {
  if (OP.busy) return
  try {
    const items = await fetchPending(OP.token)
    OP.queue = items.map((it) => ({
      kind: 'approval',
      id: it.approval_id || it.id || it.mandate_id,
      mandate_id: it.mandate_id,
      amount_usd: it.amount_usd, asset: it.asset, counterparty: it.counterparty,
      title: it.kind === 'mandate' ? 'Mandate approval' : 'Approval required',
      detail: it.summary || `${it.amount_usd != null ? 'USD ' + it.amount_usd : ''} ${it.asset || ''} → ${it.counterparty || ''}`.trim(),
      ask: 'Approve this request?',
    }))
    render()
  } catch (e) { setBar(`offline (${e.message})`) }
}

function setBar(t) { const s = $('ph-src'); if (s) s.textContent = t }

function render(doneHtml) {
  const body = $('ph-body'); if (!body) return
  if (doneHtml) { body.innerHTML = doneHtml; return }
  const card = OP.queue[0]
  if (!card) { body.innerHTML = `<div class="phidle">No actions pending</div>`; return }

  const actions = card.kind === 'kill'
    ? `<button class="phbtn kill" data-act="kill">Kill</button><button class="phbtn" data-act="dismiss">Reset</button>`
    : `<button class="phbtn go" data-act="approve">Approve</button><button class="phbtn deny" data-act="deny">Deny</button>`

  const queued = OP.queue.length > 1 ? `<div class="phqueue">+${OP.queue.length - 1} more pending</div>` : ''
  body.innerHTML =
    `<div class="phcard ${card.urgent ? 'urgent' : ''}">
       <div class="pt">${esc(card.title)}</div>
       ${card.detail ? `<div class="pdet">${esc(card.detail)}</div>` : ''}
       ${card.ask ? `<div class="ask">${esc(card.ask)}</div>` : ''}
       <div class="phbtns">${actions}</div>
     </div>${queued}`
  body.querySelectorAll('.phbtn').forEach((b) => { b.onclick = () => act(card, b.dataset.act) })
}

async function act(card, action) {
  if (OP.busy) return
  if (action === 'dismiss') { OP.queue.shift(); render(); return }
  OP.busy = true
  $('ph-body').querySelectorAll('.phbtn').forEach((b) => (b.disabled = true))

  const label = { approve: 'approved', deny: 'denied', kill: 'killed' }[action]
  try {
    if (OP.mode === 'live') {
      if (action === 'approve') await ownerApprove(card.id, OP.token)
      else if (action === 'deny') await ownerDeny(card.id, 'owner_denied', OP.token)
      else if (action === 'kill') await ownerRevoke(card.mandate_id || card.id, 'owner_kill_switch', OP.token)
    } else {
      await new Promise((r) => setTimeout(r, 350)) // sample: simulate the round-trip
    }
    const cls = action === 'deny' || action === 'kill' ? 'bad' : 'ok'
    const mark = action === 'kill' ? '⏻ Mandate revoked · wallet dormant'
      : action === 'deny' ? '✗ request denied · final'
        : '✓ approved · agent may complete'
    render(`<div class="phcard"><div class="pt">${esc(card.title)}</div><div class="phdone ${cls}">${mark}</div></div>`)
    OP.onResolved?.({ action, card })
    OP.queue.shift()
    setTimeout(() => { OP.busy = false; if (OP.mode !== 'live') render() }, 1100)
  } catch (e) {
    render(`<div class="phcard"><div class="pt">${esc(card.title)}</div><div class="phdone bad">‼ ${esc(e.message)}</div><div class="phbtns"><button class="phbtn" data-act="retry">Back</button></div></div>`)
    $('ph-body').querySelector('.phbtn').onclick = () => { OP.busy = false; render() }
    OP.busy = false
  }
}
