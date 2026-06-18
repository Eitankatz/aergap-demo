import './styles.css'
import { resolveToken, fetchMessages, openEvents } from './api.js'
import { SAMPLE } from './sample.js'
import { classify, decisionModel, parseIntent, parseResult, OUTCOME_META, controlLabel } from './policy.js'

// ---- tiny DOM helper -------------------------------------------------------
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v
    else if (k === 'html') n.innerHTML = v
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v)
    else if (v != null) n.setAttribute(k, v)
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)))
  return n
}
const $ = (id) => document.getElementById(id)
const short = (h) => (typeof h === 'string' && h.startsWith('sha256:')) ? h.slice(0, 7) + '…' + h.slice(-6) : (h ?? '—')

// ---- state -----------------------------------------------------------------
const S = {
  ws: null,
  intents: new Map(),     // tool_call_id -> intent {amount_usd, counterparty, asset}
  decisions: [],          // decision models, in order
  selectedIdx: null,      // which decision the panel shows (null = latest)
  streamBubble: null,     // current streaming assistant bubble
  sessionFilter: '',
}

const setStatus = (t, cls = '') => { const s = $('status'); s.textContent = t; s.className = 'status ' + cls }
const chatLog = () => $('chat-log')
const scrollChat = () => { const l = chatLog(); l.scrollTop = l.scrollHeight }

// ---- chat rendering --------------------------------------------------------
function addBubble(role, text, { reasoning = false } = {}) {
  const b = el('div', { class: `msg ${role}${reasoning ? ' reasoning' : ''}` },
    el('div', { class: 'who' }, reasoning ? 'reasoning' : role),
    el('div', { class: 'body' }, text || ''))
  chatLog().append(b); scrollChat(); return b
}
function addToolChip(id, name, intent, { pending = false } = {}) {
  const sub = intent && (intent.amount_usd != null || intent.counterparty)
    ? `USD ${intent.amount_usd ?? '?'} → ${intent.counterparty ?? '?'}` : ''
  const chip = el('div', { class: `tool ${pending ? 'pending' : ''}`, 'data-tool': id },
    el('span', { class: 'tname' }, `→ ${name}`),
    sub ? el('span', { class: 'targs' }, sub) : null,
    el('span', { class: 'tstate' }, pending ? '…' : '✓'))
  chatLog().append(chip); scrollChat(); return chip
}
function resolveToolChip(id, outcome) {
  const chip = chatLog().querySelector(`.tool[data-tool="${CSS.escape(id)}"]`)
  if (!chip) return
  chip.classList.remove('pending')
  const st = chip.querySelector('.tstate')
  if (outcome) { st.textContent = ({ accept: '✓ accept', deny: '✗ deny', requires_owner_approval: '⏸ approval' })[outcome] || '✓'; chip.classList.add(`oc-${outcome}`) }
  else st.textContent = '✓'
}

// ---- policy panel ----------------------------------------------------------
function pushDecision(model) {
  S.decisions.push(model)
  S.selectedIdx = null // follow the latest as new decisions arrive
  renderPolicy()
}
function renderPolicy() {
  const body = $('policy-body')
  body.innerHTML = ''
  if (!S.decisions.length) {
    body.append(el('div', { class: 'empty', html: 'No evaluated transaction yet. The triptych appears here: <em>intent · policy evaluation · audit record.</em>' }))
    return
  }
  const curIdx = S.selectedIdx ?? S.decisions.length - 1
  const cur = S.decisions[curIdx]
  const meta = OUTCOME_META[cur.outcome] || { label: (cur.outcome || '—').toUpperCase(), cls: 'info', blurb: '' }

  // (1) intent
  const intentLine = cur.amount_usd != null || cur.counterparty
    ? `Pay USD ${cur.amount_usd ?? '?'} ${cur.asset || ''} → ${cur.counterparty ?? '?'}`.replace(/\s+/g, ' ').trim()
    : '—'

  // flags
  const flags = []
  if (cur.flags.confused_deputy) flags.push(['confused deputy', 'flag-cd'])
  if (cur.flags.terminal || cur.flags.override_allowed === false) flags.push(['terminal · no override', 'flag-term'])
  if (cur.flags.simulated) flags.push(['simulated', 'flag-sim'])

  const card = el('div', { class: `decision ${meta.cls}` },
    el('div', { class: 'trip-label' }, '1 · intent'),
    el('div', { class: 'intent' }, intentLine),

    el('div', { class: 'trip-label' }, '2 · policy evaluation'),
    el('div', { class: 'badge' }, meta.label),
    cur.reason ? el('div', { class: 'reason' }, el('span', { class: 'k' }, 'reason'), el('code', {}, cur.reason)) : null,
    el('div', { class: 'reason' }, el('span', { class: 'k' }, 'control'), el('code', {}, controlLabel(cur.control))),
    flags.length ? el('div', { class: 'flags' }, flags.map(([t, c]) => el('span', { class: `fl ${c}` }, t))) : null,
    meta.blurb ? el('div', { class: 'blurb' }, meta.blurb) : null,
    cur.message ? el('div', { class: 'blurb dim' }, cur.message) : null,

    el('div', { class: 'trip-label' }, '3 · audit record'),
    el('dl', { class: 'audit' },
      kv('policy_hash', short(cur.policy_hash), cur.policy_hash),
      cur.plan_hash ? kv('plan_hash', short(cur.plan_hash), cur.plan_hash) : null,
      cur.audit_seq != null ? kv('audit_seq', String(cur.audit_seq)) : null,
      cur.tx_id ? kv('tx_id', cur.tx_id) : null,
      cur.ticket_id ? kv('ticket_id', cur.ticket_id) : null,
      cur.approval_id ? kv('approval_id', cur.approval_id) : null,
      cur.mandate_id ? kv('mandate_id', cur.mandate_id) : null),
  )
  body.append(card)

  // audit trail (all decisions)
  if (S.decisions.length > 1) {
    const trail = el('div', { class: 'trail' }, el('div', { class: 'trail-head' }, 'audit trail'))
    S.decisions.forEach((d, i) => {
      const m = OUTCOME_META[d.outcome] || { cls: 'info' }
      trail.append(el('div', { class: `trow ${m.cls}${i === curIdx ? ' is-cur' : ''}`, onclick: () => { S.selectedIdx = i; renderPolicy() } },
        el('span', { class: 'tseq' }, d.audit_seq != null ? `#${d.audit_seq}` : `·`),
        el('span', { class: 'toc' }, (d.outcome || '').replace(/_/g, ' ')),
        el('span', { class: 'twho' }, `${d.amount_usd != null ? 'USD ' + d.amount_usd : ''} ${d.counterparty || ''}`.trim()),
        el('span', { class: 'thash' }, short(d.policy_hash))))
    })
    body.append(trail)
  }
}
const kv = (k, v, title) => el('div', { class: 'kv' }, el('dt', {}, k), el('dd', title ? { title } : {}, v))

// ---- ingest a tool result (decision / wallet / mandate) --------------------
function ingestToolResult(toolCallId, name, resultObj) {
  const kind = classify(resultObj)
  if (kind === 'decision') {
    const intent = S.intents.get(toolCallId) || null
    pushDecision(decisionModel(resultObj, intent))
    resolveToolChip(toolCallId, resultObj.outcome)
  } else {
    resolveToolChip(toolCallId)
  }
}

// ---- replay (a stored session or the sample) -------------------------------
function renderTranscript(data) {
  reset()
  for (const m of data.messages || []) {
    const role = m.role || m.type
    if (role === 'session_meta' || role === 'system') continue
    if (role === 'user') addBubble('user', stringContent(m.content))
    else if (role === 'assistant') {
      if (m.reasoning) addBubble('assistant', stringContent(m.reasoning), { reasoning: true })
      const txt = stringContent(m.content)
      if (txt) addBubble('assistant', txt)
      for (const tc of (m.tool_calls || [])) {
        const name = tc.function?.name || tc.name || 'tool'
        const intent = parseIntent(tc.function?.arguments)
        if (intent) S.intents.set(tc.id || tc.call_id, intent)
        addToolChip(tc.id || tc.call_id, name, intent)
      }
    } else if (role === 'tool') {
      ingestToolResult(m.tool_call_id, m.tool_name, parseResult(m.content))
    }
  }
  scrollChat()
}
const stringContent = (c) => {
  if (c == null) return ''
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map((p) => (typeof p === 'string' ? p : p.text || '')).join('')
  return typeof c === 'object' ? (c.text || JSON.stringify(c)) : String(c)
}

// ---- live (/api/events) ----------------------------------------------------
function handleFrame(frame) {
  const p = frame?.params
  if (!p || frame.method !== 'event') return
  if (S.sessionFilter && p.session_id && p.session_id !== S.sessionFilter) return
  const pl = p.payload || {}
  switch (p.type) {
    case 'message.start': S.streamBubble = addBubble('assistant', pl.text || ''); break
    case 'message.delta': if (!S.streamBubble) S.streamBubble = addBubble('assistant', ''); S.streamBubble.querySelector('.body').append(pl.text || pl.delta || ''); scrollChat(); break
    case 'message.complete': if (pl.text && S.streamBubble) S.streamBubble.querySelector('.body').textContent = pl.text; S.streamBubble = null; break
    case 'thinking.delta': /* noisy; fold into a single reasoning bubble */ {
      let r = chatLog().querySelector('.msg.reasoning.live'); if (!r) { r = addBubble('assistant', '', { reasoning: true }); r.classList.add('live') }
      r.querySelector('.body').append(pl.text || ''); scrollChat(); break }
    case 'reasoning.available': { const r = chatLog().querySelector('.msg.reasoning.live'); if (r) r.classList.remove('live'); if (pl.text) addBubble('assistant', pl.text, { reasoning: true }); break }
    case 'tool.start': { const intent = parseIntent(pl.args_text); if (intent) S.intents.set(pl.tool_id, intent); addToolChip(pl.tool_id, pl.name || 'tool', intent, { pending: true }); break }
    case 'tool.complete': { const res = parseResult(pl.result_text); if (res) ingestToolResult(pl.tool_id, pl.name, res); else resolveToolChip(pl.tool_id); break }
    case 'status.update': setStatus(pl.text || 'status', 'live'); break
    case 'error': addBubble('error', pl.message || 'error'); break
    default: break
  }
}

// ---- wiring ----------------------------------------------------------------
function reset() {
  S.intents.clear(); S.decisions = []; S.selectedIdx = null; S.streamBubble = null
  chatLog().innerHTML = ''; renderPolicy()
}
function closeWs() { if (S.ws) { try { S.ws.close() } catch {} S.ws = null } }

async function go() {
  closeWs()
  const mode = $('mode').value
  S.sessionFilter = $('session').value.trim()
  try {
    if (mode === 'sample') { renderTranscript(SAMPLE); setStatus('sample loaded', 'ok'); return }
    const token = await resolveToken($('token').value)
    if (mode === 'replay') {
      if (!S.sessionFilter) { setStatus('enter a session id', 'err'); return }
      setStatus('loading…')
      renderTranscript(await fetchMessages(S.sessionFilter, token))
      setStatus('replay loaded', 'ok'); return
    }
    // live
    if (!token) { setStatus('no token (start dashboard or paste token)', 'err'); return }
    reset()
    S.ws = await openEvents({ token, channel: 'all', onFrame: handleFrame, onState: (s) => setStatus(s, s === 'live' ? 'live' : '') })
  } catch (e) { setStatus(String(e.message || e), 'err') }
}

// persist a couple of fields
const LS = 'aergap-web-ui'
function loadCfg() { try { const c = JSON.parse(localStorage.getItem(LS) || '{}'); if (c.mode) $('mode').value = c.mode; if (c.session) $('session').value = c.session; if (c.token) $('token').value = c.token } catch {} }
function saveCfg() { localStorage.setItem(LS, JSON.stringify({ mode: $('mode').value, session: $('session').value, token: $('token').value })) }

$('go').addEventListener('click', () => { saveCfg(); go() })
$('mode').addEventListener('change', saveCfg)
loadCfg()
renderPolicy()
// Auto-run the offline sample on load so the panel mapping is visible immediately.
// Live/Replay require clicking Connect (they need the dashboard).
if ($('mode').value === 'sample') go()
