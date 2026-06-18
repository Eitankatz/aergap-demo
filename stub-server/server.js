#!/usr/bin/env node
'use strict';
/*
 * Aergap demo — StablePro Wallet Agent Server STUB.
 *
 * A dependency-free Node HTTP server that mimics the live agent server at
 * localhost:9740 closely enough to run all five demo scenes offline. It ports
 * the mock policy engine for the `payer.v1` floor:
 *
 *   - three outcomes:  accept / deny / requires_owner_approval   (fixed vocabulary)
 *   - per-tx cap:      USD 5   (at or below -> agent acts alone -> accept)
 *   - approval gate:   USD 25  (the role's documented owner-approval threshold)
 *   - allowlist:       acme-coffee   (counterparty allowlist on the Mandate)
 *   - global blocklist: sanctioned-addr   (risk-plane sanctions, terminal, no override)
 *
 * Honesty: this is a STUB. There is no key, no signing, no settlement —
 * execution is reported as simulated, exactly as the demo claims. Catches land
 * at "Gate 2" (authorization) as they would on the real server, never as a
 * content filter. Routes/JSON shapes here are spec-faithful but PROVISIONAL
 * until Rasmus's agent-mcp binary confirms the live contract (see WIRING.md).
 */

const http = require('http');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Config (all overridable via env so the stub shares the demo's one .env)
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.STUB_PORT || '9740', 10);
const HOST = process.env.STUB_HOST || '127.0.0.1';
const OWNER_TOKEN = process.env.AGENT_OWNER_API_TOKEN || 'demo-owner-token';
const AGENT_TOKEN = process.env.AGENT_API_TOKEN || 'demo-agent-token';
const AUTH_MODE = (process.env.STUB_AUTH || 'strict').toLowerCase(); // strict | off
const GLOBAL_BLOCKLIST = (process.env.AGENT_BLOCKLIST || 'sanctioned-addr')
  .split(',').map((s) => s.trim()).filter(Boolean);

// payer.v1 floor — the numbers the policy engine evaluates against.
const PAYER_FLOOR = { per_tx_cap_usd: 5, human_approval_threshold_usd: 25, counterparty_allowlist: ['acme-coffee'] };

// Representative role taxonomy for list_roles (payer.v1 is the demo role).
const ROLES = [
  { role: 'payer.v1', action_category: 'transfer_stable', assets_allowed: ['USDC', 'USDT', 'PYUSD', 'EURC'], floor: 'per-tx USD 5; owner approval at USD 25' },
  { role: 'swapper.v1', action_category: 'dex_swap', floor: 'allowlisted venues; oracle check; slippage floor 50 bps' },
  { role: 'bridger.v1', action_category: 'bridge', floor: 'KIMA default; per-tx USD 25,000' },
  { role: 'card_spender.v1', action_category: 'card_spend', floor: 'per-tx USD 200; gambling + cash-advance blocked' },
  { role: 'staker.v1', action_category: 'stake', floor: 'per-tx USD 100,000; slashing auto-pause; TTL 180d' },
  { role: 'treasury.v1', action_category: 'treasury_batch', floor: 'per-tx USD 50,000; multi-sig at USD 100,000; batch 100' },
];

// ---------------------------------------------------------------------------
// In-memory state — starts DORMANT (no active Mandate) so Scene 1 lands.
// ---------------------------------------------------------------------------
const WALLET = { wallet_id: 'wallet-hermes-001', owner_wallet: 'owner-wallet-001' };
const mandates = new Map();   // id -> mandate
const approvals = new Map();  // id -> parked over-cap payment approval
const audit = [];             // tamper-evident, hash-chained event log
let auditTip = 'genesis';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sha = (obj) => 'sha256:' + crypto.createHash('sha256').update(typeof obj === 'string' ? obj : JSON.stringify(obj)).digest('hex');
const nowIso = () => new Date().toISOString();
const newId = (p) => `${p}_${crypto.randomBytes(5).toString('hex')}`;
const num = (v) => { if (typeof v === 'number') return v; if (typeof v === 'string') { const n = parseFloat(v.replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : NaN; } return NaN; };

function activeMandate() {
  for (const m of mandates.values()) if (m.state === 'active') return m;
  return null;
}

function walletState() {
  const m = activeMandate();
  return { wallet_id: WALLET.wallet_id, owner_wallet: WALLET.owner_wallet, state: m ? 'active' : 'dormant', active_mandate_id: m ? m.mandate_id : null };
}

// Compile role floor + owner overrides into an immutable policy object.
// "Overrides only tighten": caps can shrink, allowlists can narrow, never loosen.
function compilePolicy(role, overrides = {}) {
  const floor = role === 'payer.v1' ? PAYER_FLOOR : PAYER_FLOOR; // demo runs payer.v1
  const cap = Math.min(num(overrides.per_tx_cap_usd) || floor.per_tx_cap_usd, floor.per_tx_cap_usd);
  const threshold = Math.min(num(overrides.human_approval_threshold_usd) || floor.human_approval_threshold_usd, floor.human_approval_threshold_usd);
  let allowlist = Array.isArray(overrides.counterparty_allowlist) ? overrides.counterparty_allowlist : floor.counterparty_allowlist;
  if (!allowlist || allowlist.length === 0) allowlist = floor.counterparty_allowlist; // never leave it empty in the demo
  return {
    role, assets_allowed: ['USDC', 'USDT', 'PYUSD', 'EURC'],
    per_tx_cap_usd: cap, human_approval_threshold_usd: threshold,
    counterparty_allowlist: allowlist, counterparty_blocklist: GLOBAL_BLOCKLIST,
    valid_until: overrides.valid_until || null,
  };
}

function logAudit(ev) {
  const entry = { seq: audit.length + 1, ts: nowIso(), prev_hash: auditTip, ...ev };
  entry.entry_hash = sha({ seq: entry.seq, ts: entry.ts, prev_hash: entry.prev_hash, body: ev });
  auditTip = entry.entry_hash;
  audit.push(entry);
  return entry;
}

// ---------------------------------------------------------------------------
// The policy engine: one evaluated request -> exactly one outcome.
// ---------------------------------------------------------------------------
function evaluate(req) {
  const asset = req.asset || 'USDC';
  const cp = req.counterparty;
  const amount = num(req.amount_usd);
  const m = activeMandate();

  // Dormancy invariant: no active Mandate -> nothing can be signed, ever.
  if (!m) {
    const r = { outcome: 'deny', reason: 'no_active_mandate', control: 'dormancy_invariant', signing: false, policy_hash: null, message: 'Wallet is dormant: no active Mandate. Nothing can be signed.' };
    logAudit({ type: 'transaction', mandate_id: null, action: 'transfer_stable', asset, amount_usd: amount, counterparty: cp, outcome: r.outcome, reason: r.reason, control: r.control, policy_hash: null });
    return r;
  }

  const reject = (reason, control, extra = {}) => {
    const r = { outcome: 'deny', reason, control, mandate_id: m.mandate_id, policy_hash: m.policy_hash, ...extra };
    logAudit({ type: 'transaction', mandate_id: m.mandate_id, action: 'transfer_stable', asset, amount_usd: amount, counterparty: cp, outcome: 'deny', reason, control, policy_hash: m.policy_hash });
    return r;
  };

  // Risk plane — sanctions blocklist is terminal, not even the owner overrides it.
  if (GLOBAL_BLOCKLIST.includes(cp) || m.scope.counterparty_blocklist.includes(cp)) {
    return reject('counterparty_blocklisted', 'risk_plane.sanctions', { terminal: true, override_allowed: false, plane: 'legality' });
  }
  // Gate 2 (TBAC) — counterparty must be on the Mandate allowlist. (Scene 4.)
  if (!m.scope.counterparty_allowlist.includes(cp)) {
    return reject('counterparty_not_allowlisted', 'gate2.tbac.counterparty_allowlist', { confused_deputy: true, note: 'Injected redirect reached Gate 2 and failed authorization — not a content filter.' });
  }
  if (!m.scope.assets_allowed.includes(asset)) {
    return reject('asset_not_allowed', 'gate2.tbac.asset_scope');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return reject('invalid_amount', 'gate2.tbac.amount');
  }

  const cap = m.scope.per_tx_cap_usd;
  const threshold = m.scope.human_approval_threshold_usd;

  // Has the owner already approved THIS exact payment? (Scene 3, block 2.)
  const ticket = findApprovedTicket(m.mandate_id, cp, amount, asset);

  if (amount > cap && !ticket) {
    // Escalate — park for owner approval. Reuse an existing parked request for the same params.
    let parked = null;
    for (const a of approvals.values()) {
      if (a.state === 'pending_owner_approval' && a.mandate_id === m.mandate_id && a.counterparty === cp && a.amount_usd === amount && a.asset === asset) { parked = a; break; }
    }
    if (!parked) {
      const id = newId('appr');
      parked = { approval_id: id, kind: 'payment_approval', mandate_id: m.mandate_id, action: 'transfer_stable', asset, amount_usd: amount, counterparty: cp, state: 'pending_owner_approval', created_at: nowIso() };
      approvals.set(id, parked);
    }
    const reason = amount > threshold ? 'exceeds_owner_approval_threshold' : 'exceeds_per_tx_cap';
    const r = { outcome: 'requires_owner_approval', reason, control: 'gate2.tbac.amount_cap', mandate_id: m.mandate_id, policy_hash: m.policy_hash, approval_id: parked.approval_id, per_tx_cap_usd: cap, human_approval_threshold_usd: threshold, message: `USD ${amount} exceeds the per-tx cap (USD ${cap}); parked for owner approval as ${parked.approval_id}.` };
    logAudit({ type: 'transaction', mandate_id: m.mandate_id, action: 'transfer_stable', asset, amount_usd: amount, counterparty: cp, outcome: 'requires_owner_approval', reason, control: r.control, policy_hash: m.policy_hash, approval_id: parked.approval_id });
    return r;
  }

  // ACCEPT — within the floor, or an owner-approved ticket exists. Mint a
  // single-use ticket bound to a plan hash of the exact request, then "sign"
  // and "execute" (simulated).
  if (ticket) ticket.state = 'consumed';
  const plan_hash = sha({ mandate_id: m.mandate_id, asset, amount_usd: amount, counterparty: cp });
  const tx_id = newId('tx');
  const ticket_id = newId('tkt');
  m.counters.tx_count += 1;
  m.counters.total_spent_usd += amount;
  const control = ticket ? 'owner_approval (gate2 + approval ticket)' : 'gate2.tbac.within_floor';
  const ev = logAudit({ type: 'transaction', mandate_id: m.mandate_id, action: 'transfer_stable', asset, amount_usd: amount, counterparty: cp, outcome: 'accept', reason: null, control, policy_hash: m.policy_hash, plan_hash, ticket_id, tx_id, executed: true, simulated: true });
  return { outcome: 'accept', mandate_id: m.mandate_id, asset, amount_usd: amount, counterparty: cp, control, executed: true, simulated: true, tx_id, ticket_id, plan_hash, policy_hash: m.policy_hash, audit_seq: ev.seq };
}

function findApprovedTicket(mandateId, cp, amount, asset) {
  for (const a of approvals.values()) {
    if (a.state === 'approved' && a.mandate_id === mandateId && a.counterparty === cp && a.amount_usd === amount && a.asset === asset) return a;
  }
  return null;
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------
function send(res, code, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { if (!raw) return resolve({}); try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function bearer(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

// Auth: owner routes require the OWNER token (this is how the stub proves the
// agent token cannot approve). Agent routes require any non-empty token.
function authorize(req, scope) {
  if (AUTH_MODE === 'off') return null;
  const tok = bearer(req);
  if (scope === 'owner') {
    if (tok !== OWNER_TOKEN) return { code: 403, body: { error: 'principal_not_authorized', message: 'Owner endpoints require the OWNER token (AGENT_OWNER_API_TOKEN). The agent token is rejected here by design.' } };
  } else {
    if (!tok) return { code: 401, body: { error: 'missing_token', message: 'Agent endpoints require a Bearer token (AGENT_API_TOKEN).' } };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();
  let status = 200;
  try {
    // Health check (no auth) — DEMO-RUNBOOK §2 curls this.
    if (path === '/' || path === '/health') {
      return send(res, 200, { service: 'stablepro-wallet-agent-server', mode: 'STUB', status: 'ok', time: nowIso(), wallet: walletState(), hint: 'This is the local stub. See stub-server/README.md.' });
    }

    // ---- Agent-facing routes (the 5 MCP tools' backing endpoints) ----
    if (path === '/agent/roles' && method === 'GET') {
      const a = authorize(req, 'agent'); if (a) { status = a.code; return send(res, a.code, a.body); }
      return send(res, 200, { roles: ROLES });
    }
    if (path === '/agent/wallet' && method === 'GET') {
      const a = authorize(req, 'agent'); if (a) { status = a.code; return send(res, a.code, a.body); }
      return send(res, 200, walletState());
    }
    if (path === '/agent/mandates' && method === 'POST') {
      const a = authorize(req, 'agent'); if (a) { status = a.code; return send(res, a.code, a.body); }
      const b = await readBody(req);
      const role = b.role || 'payer.v1';
      const scope = compilePolicy(role, b.scope || b.overrides || b);
      const id = newId('mnd');
      const policy_hash = sha({ role, scope });
      const m = { mandate_id: id, role, state: 'pending_owner_approval', scope, policy_hash, wallet_id: WALLET.wallet_id, created_at: nowIso(), activated_at: null, revoked_at: null, reason: null, counters: { tx_count: 0, total_spent_usd: 0 } };
      mandates.set(id, m);
      logAudit({ type: 'mandate_state_change', mandate_id: id, from: null, to: 'pending_owner_approval', action: 'propose_mandate', policy_hash });
      return send(res, 201, { mandate_id: id, state: m.state, role, scope, policy_hash, message: 'Mandate proposed and parked for owner approval.' });
    }
    let mm = path.match(/^\/agent\/mandates\/([^/]+)$/);
    if (mm && method === 'GET') {
      const a = authorize(req, 'agent'); if (a) { status = a.code; return send(res, a.code, a.body); }
      const m = mandates.get(mm[1]);
      if (!m) { status = 404; return send(res, 404, { error: 'mandate_not_found', mandate_id: mm[1] }); }
      return send(res, 200, m);
    }
    if (path === '/agent/transactions' && method === 'POST') {
      const a = authorize(req, 'agent'); if (a) { status = a.code; return send(res, a.code, a.body); }
      const b = await readBody(req);
      const reqObj = {
        action: b.action || b.type || 'transfer_stable',
        asset: b.asset || b.currency || b.token || 'USDC',
        amount_usd: b.amount_usd != null ? b.amount_usd : (b.amount != null ? b.amount : b.value),
        counterparty: b.counterparty || b.to || b.payee || b.recipient || b.destination,
        mandate_id: b.mandate_id || b.mandateId,
      };
      const result = evaluate(reqObj);
      status = result.outcome === 'deny' ? 200 : 200; // outcomes are 200; the body carries the verdict
      return send(res, 200, result);
    }

    // ---- Owner-facing routes (match owner-scripts/common.sh EP_*) ----
    if (path === '/owner/mandates' && method === 'GET') {
      const a = authorize(req, 'owner'); if (a) { status = a.code; return send(res, a.code, a.body); }
      const want = url.searchParams.get('state');
      const items = [];
      for (const m of mandates.values()) {
        if (!want || m.state === want) items.push({ kind: 'mandate', id: m.mandate_id, mandate_id: m.mandate_id, role: m.role, state: m.state, scope: m.scope, policy_hash: m.policy_hash, summary: `${m.role} mandate — cap USD ${m.scope.per_tx_cap_usd}, allowlist [${m.scope.counterparty_allowlist.join(', ')}]` });
      }
      if (!want || want === 'pending_owner_approval') {
        for (const ap of approvals.values()) {
          if (ap.state === 'pending_owner_approval') items.push({ kind: 'payment_approval', id: ap.approval_id, approval_id: ap.approval_id, mandate_id: ap.mandate_id, state: ap.state, action: ap.action, asset: ap.asset, amount_usd: ap.amount_usd, counterparty: ap.counterparty, summary: `payment USD ${ap.amount_usd} ${ap.asset} -> ${ap.counterparty} (awaiting owner)` });
        }
      }
      return send(res, 200, { count: items.length, items });
    }
    let om = path.match(/^\/owner\/mandates\/([^/]+)(\/(approve|deny|revoke|unfreeze))?$/);
    if (om) {
      const a = authorize(req, 'owner'); if (a) { status = a.code; return send(res, a.code, a.body); }
      const id = om[1];
      const verb = om[3];
      const m = mandates.get(id);
      const ap = approvals.get(id);

      if (!verb && method === 'GET') {
        if (m) return send(res, 200, m);
        if (ap) return send(res, 200, ap);
        status = 404; return send(res, 404, { error: 'not_found', id });
      }
      if (verb && method === 'POST') {
        const b = await readBody(req);
        if (verb === 'approve') {
          if (m && m.state === 'pending_owner_approval') {
            m.state = 'active'; m.activated_at = nowIso();
            logAudit({ type: 'mandate_state_change', mandate_id: id, from: 'pending_owner_approval', to: 'active', action: 'owner_approve', policy_hash: m.policy_hash });
            return send(res, 200, { mandate_id: id, state: 'active', activated_at: m.activated_at, policy_hash: m.policy_hash, message: 'Mandate approved and active.' });
          }
          if (ap && ap.state === 'pending_owner_approval') {
            ap.state = 'approved'; ap.approved_at = nowIso();
            logAudit({ type: 'payment_approval', approval_id: id, mandate_id: ap.mandate_id, to: 'approved', action: 'owner_approve_payment', amount_usd: ap.amount_usd, counterparty: ap.counterparty });
            return send(res, 200, { approval_id: id, state: 'approved', message: `Payment of USD ${ap.amount_usd} to ${ap.counterparty} approved. Agent may now complete it.` });
          }
          status = 409; return send(res, 409, { error: 'not_pending', id, message: 'Nothing in pending_owner_approval for this id.' });
        }
        if (verb === 'deny') {
          const reason = b.reason || 'owner_denied';
          if (m && m.state === 'pending_owner_approval') { m.state = 'revoked'; m.revoked_at = nowIso(); m.reason = reason; logAudit({ type: 'mandate_state_change', mandate_id: id, from: 'pending_owner_approval', to: 'revoked', action: 'owner_deny', reason, policy_hash: m.policy_hash }); return send(res, 200, { mandate_id: id, state: 'revoked', reason, message: 'Mandate denied. A denial is final.' }); }
          if (ap && ap.state === 'pending_owner_approval') { ap.state = 'denied'; ap.reason = reason; logAudit({ type: 'payment_approval', approval_id: id, mandate_id: ap.mandate_id, to: 'denied', action: 'owner_deny_payment', reason }); return send(res, 200, { approval_id: id, state: 'denied', reason }); }
          status = 409; return send(res, 409, { error: 'not_pending', id });
        }
        if (verb === 'revoke') {
          const reason = b.reason || 'owner_kill_switch';
          if (m && ['active', 'pending_owner_approval', 'executing', 'suspended', 'draft'].includes(m.state)) {
            const from = m.state; m.state = 'revoked'; m.revoked_at = nowIso(); m.reason = reason;
            logAudit({ type: 'mandate_state_change', mandate_id: id, from, to: 'revoked', action: 'owner_revoke_kill_switch', reason, policy_hash: m.policy_hash });
            return send(res, 200, { mandate_id: id, state: 'revoked', reason, wallet: walletState(), message: 'Kill switch fired. Mandate revoked; wallet is dormant.' });
          }
          status = 409; return send(res, 409, { error: 'not_revocable', id, state: m ? m.state : 'missing' });
        }
        if (verb === 'unfreeze') {
          if (m && m.state === 'suspended') { m.state = 'active'; logAudit({ type: 'mandate_state_change', mandate_id: id, from: 'suspended', to: 'active', action: 'owner_unfreeze', policy_hash: m.policy_hash }); return send(res, 200, { mandate_id: id, state: 'active', message: 'Mandate unfrozen; back to active.' }); }
          status = 409; return send(res, 409, { error: 'not_suspended', id, state: m ? m.state : 'missing' });
        }
      }
    }
    if (path === '/owner/audit' && method === 'GET') {
      const a = authorize(req, 'owner'); if (a) { status = a.code; return send(res, a.code, a.body); }
      const mid = url.searchParams.get('mandate_id');
      const events = mid ? audit.filter((e) => e.mandate_id === mid) : audit.slice();
      return send(res, 200, { count: events.length, tamper_evident: true, audit_tip: auditTip, events });
    }

    status = 404;
    return send(res, 404, { error: 'route_not_found', method, path, hint: 'See stub-server/README.md for the route list.' });
  } catch (err) {
    status = 500;
    return send(res, 500, { error: 'stub_internal_error', message: String(err && err.message || err) });
  } finally {
    // eslint-disable-next-line no-console
    console.log(`${nowIso()}  ${method} ${path} -> ${status}`);
  }
});

server.listen(PORT, HOST, () => {
  /* eslint-disable no-console */
  console.log('───────────────────────────────────────────────────────────');
  console.log('  Aergap demo — StablePro Wallet Agent Server  [STUB]');
  console.log(`  Listening:   http://${HOST}:${PORT}`);
  console.log(`  Auth:        ${AUTH_MODE}  (owner token required on /owner/*)`);
  console.log(`  Agent token: ${AGENT_TOKEN === 'demo-agent-token' ? 'demo-agent-token (default)' : '(from AGENT_API_TOKEN)'}`);
  console.log(`  Owner token: ${OWNER_TOKEN === 'demo-owner-token' ? 'demo-owner-token (default)' : '(from AGENT_OWNER_API_TOKEN)'}`);
  console.log(`  Floor:       payer.v1  cap USD ${PAYER_FLOOR.per_tx_cap_usd}, approval USD ${PAYER_FLOOR.human_approval_threshold_usd}, allowlist [${PAYER_FLOOR.counterparty_allowlist.join(', ')}]`);
  console.log(`  Blocklist:   [${GLOBAL_BLOCKLIST.join(', ')}]  (sanctions, terminal)`);
  console.log('  Wallet starts DORMANT (no active Mandate) — Scene 1 ready.');
  console.log('───────────────────────────────────────────────────────────');
});
