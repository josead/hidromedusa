// MetaCall Lambda — Ticket management (no Mercado Pago; WhatsApp + secret phrase).
// Lifecycle: pending -> freed (claim minted) -> used. No user accounts.
// Endpoints (see CONTRACT.md "HTTP API" → Tickets):
//   POST /tickets/request   (public) { type, buyerName, buyerEmail?, buyerPhone?, merchIdea? } → { ticket }
//   GET  /tickets           (staff)  ?status= → { tickets }
//   POST /tickets/:id/free  (staff)  { staffToken } → { ticket }
//   POST /tickets/issue     (staff)  { type, buyerName, ..., staffToken } → { ticket }
//   POST /tickets/redeem    (public) { claim } → { ticket, event }
//   POST /tickets/:id/scan  (staff)  { staffToken } → { valid, ticket, reason? }
//   GET  /tickets/:id       (staff)  → { ticket, event }

const crypto = require('crypto');
const store = require('../lib/store');
const claimcode = require('../lib/claimcode');
const email = require('../lib/email');

// Lifecycle order — status only ever moves FORWARD (never downgrades).
const STATUS_RANK = { lead: 0, pending: 1, freed: 2, used: 3, cancelled: 3 };
const rank = (s) => (s in STATUS_RANK ? STATUS_RANK[s] : -1);

// In-file event map (hardcoded fallback per CONTRACT.md "Event").
const EVENTS = {
  'ev-1': {
    id: 'ev-1',
    name: 'Hidromedusa · 11 Jul',
    date: '2026-07-11',
    time: '20:00 a 03:00',
    venue: '990 Espacio Cultural, Tandil',
  },
};

// ── Helpers ───────────────────────────────────────

// Staff gate: open when STAFF_TOKEN unset/empty, else require a matching token
// from the body (POST), the query string (GET ?staffToken=) or an
// Authorization: Bearer <token> header — whichever the caller can send.
function requireStaff(req) {
  const want = process.env.STAFF_TOKEN;
  if (!want) return true;
  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const fromHeader = auth.replace(/^Bearer\s+/i, '').trim();
  return req.body?.staffToken === want || req.query?.staffToken === want || fromHeader === want;
}

// Fresh, store-unique ticket id.
function makeId() {
  return `HM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// Mint a UNIQUE claim phrase + the patch that frees a ticket.
// Loops makePhrase() until the normalized form is free; falls back to a
// short random suffix after ~20 collisions.
async function freePatch(ticket) {
  let claim = null;
  for (let i = 0; i < 20; i++) {
    const p = claimcode.makePhrase();
    if (!(await store.tickets.byClaim(claimcode.normalize(p)))) { claim = p; break; }
  }
  if (!claim) {
    claim = `${claimcode.makePhrase()}-${crypto.randomBytes(2).toString('hex')}`;
  }
  const claimNorm = claimcode.normalize(claim);
  const qrData = Buffer.from(JSON.stringify({
    id: ticket.id, claim, type: ticket.type, eventId: ticket.eventId,
  })).toString('base64');
  return { claim, claimNorm, qrData, status: 'freed', freedAt: new Date().toISOString() };
}

// Build a fresh pending ticket record from a request body.
function newTicket(body) {
  const { type, buyerName, buyerEmail, buyerPhone, merchIdea } = body;
  return {
    id: makeId(),
    type,
    eventId: 'ev-1',
    buyerName,
    buyerEmail: buyerEmail || null,
    buyerPhone: buyerPhone || null,
    merchIdea: merchIdea || null,
    claim: null,
    // claimNorm intentionally OMITTED until a claim is minted: it's the GSI key
    // and the index is sparse — writing null here is rejected by DynamoDB.
    qrData: null,
    status: 'pending',
    issuedBy: null,
    createdAt: new Date().toISOString(),
    freedAt: null,
    usedAt: null,
  };
}

// ── Handlers ──────────────────────────────────────

// PUBLIC: upsert a lead/intent — single funnel (lead → pending → freed → used).
// Deduped by client-supplied leadId (used as the ticket id). MERGE semantics:
// only provided non-empty fields are written (never blanks existing data), and
// status only moves forward. Called on form blur (stage 'lead') and on the pay
// button (stage 'pending'). No claim is minted here — that's staff's `free`.
async function capture(req) {
  const body = req.body || {};
  const leadId = typeof body.leadId === 'string' && /^HM-[A-Za-z0-9]{4,}$/.test(body.leadId)
    ? body.leadId : null;
  const wantStatus = body.stage === 'pending' ? 'pending' : 'lead';
  const channel = body.channel || null;

  // At least one identifying field is required to bother persisting.
  const name  = (body.buyerName  || '').trim() || null;
  const eml   = (body.buyerEmail || '').trim() || null;
  const phone = (body.buyerPhone || '').trim() || null;
  if (!name && !eml && !phone) return { status: 400, body: { error: 'Nothing to capture' } };

  try {
    const id = leadId || makeId();
    const existing = leadId ? await store.tickets.get(id) : null;
    const now = new Date().toISOString();

    if (!existing) {
      const ticket = {
        ...newTicket({ type: 'general', buyerName: name, buyerEmail: eml, buyerPhone: phone }),
        id,
        status: wantStatus,
        channel,
        updatedAt: now,
      };
      await store.tickets.put(ticket);
      return { status: 200, body: { ticket } };
    }

    // MERGE: don't override existing values with null; status only advances.
    const patch = { updatedAt: now };
    if (name)    patch.buyerName  = name;
    if (eml)     patch.buyerEmail = eml;
    if (phone)   patch.buyerPhone = phone;
    if (channel) patch.channel    = channel;
    if (rank(wantStatus) > rank(existing.status)) patch.status = wantStatus;

    const updated = await store.tickets.update(id, patch);
    return { status: 200, body: { ticket: updated } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// PUBLIC (legacy): log a lead as a pending ticket. Kept for back-compat; new
// frontend uses `capture`. Delegates to the same single-funnel logic.
async function request(req) {
  const body = req.body || {};
  if (!body.buyerName) return { status: 400, body: { error: 'buyerName required' } };
  return capture({ body: { ...body, stage: 'pending' } });
}

// STAFF: list tickets, optional ?status= filter.
async function list(req) {
  if (!requireStaff(req)) return { status: 401, body: { error: 'Staff token required' } };
  try {
    const status = req.query?.status;
    const tickets = await store.tickets.list({ status });
    return { status: 200, body: { tickets } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// STAFF: free a pending ticket — mint a unique claim. Idempotent once freed/used.
async function free(req) {
  if (!requireStaff(req)) return { status: 401, body: { error: 'Staff token required' } };
  try {
    const id = req.params?.id;
    const ticket = await store.tickets.get(id);
    if (!ticket) return { status: 404, body: { error: 'Ticket not found' } };
    if (ticket.status === 'freed' || ticket.status === 'used') {
      return { status: 200, body: { ticket } };
    }
    const patch = await freePatch(ticket);
    const updated = await store.tickets.update(id, patch);
    // Best-effort confirmation email — AWAITed so the SES call finishes before
    // Lambda freezes the execution env (fire-and-forget would risk dropping it).
    await email.sendTicketConfirmation({ to: updated.buyerEmail, name: updated.buyerName, claim: updated.claim })
      .catch((e) => console.error('[tickets.free] email error:', e && e.message));
    return { status: 200, body: { ticket: updated } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// STAFF: create + free in one step — straight to 'freed'.
async function issue(req) {
  if (!requireStaff(req)) return { status: 401, body: { error: 'Staff token required' } };
  const body = req.body || {};
  const { type, buyerName } = body;
  if (type !== 'general' && type !== 'vip') return { status: 400, body: { error: 'Invalid type' } };
  if (!buyerName) return { status: 400, body: { error: 'buyerName required' } };
  try {
    const ticket = newTicket(body);
    Object.assign(ticket, await freePatch(ticket));
    await store.tickets.put(ticket);
    await email.sendTicketConfirmation({ to: ticket.buyerEmail, name: ticket.buyerName, claim: ticket.claim })
      .catch((e) => console.error('[tickets.issue] email error:', e && e.message));
    return { status: 200, body: { ticket } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// PUBLIC: redeem a claim phrase → ticket + event (for the ticket card / palabras clave).
async function redeem(req) {
  const { claim } = req.body || {};
  try {
    const norm = claimcode.normalize(claim);
    const ticket = await store.tickets.byClaim(norm);
    if (!ticket) return { status: 404, body: { error: 'No encontramos ese código' } };
    const event = EVENTS[ticket.eventId] || null;
    return { status: 200, body: { ticket, event } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// STAFF: scan at the door — mark freed ticket as used (one shot).
async function scan(req) {
  if (!requireStaff(req)) return { status: 401, body: { error: 'Staff token required' } };
  try {
    const id = req.params?.id;
    const ticket = await store.tickets.get(id);
    if (!ticket) return { status: 404, body: { valid: false, reason: 'Ticket not found' } };
    if (ticket.status === 'used') {
      return { status: 200, body: { valid: false, reason: 'Ticket already used', usedAt: ticket.usedAt } };
    }
    if (ticket.status !== 'freed') {
      return { status: 200, body: { valid: false, reason: 'Ticket not freed' } };
    }
    const updated = await store.tickets.update(id, { status: 'used', usedAt: new Date().toISOString() });
    return { status: 200, body: { valid: true, ticket: updated } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// STAFF: fetch a single ticket + its event.
async function getTicket(req) {
  if (!requireStaff(req)) return { status: 401, body: { error: 'Staff token required' } };
  try {
    const id = req.params?.id;
    const ticket = await store.tickets.get(id);
    if (!ticket) return { status: 404, body: { error: 'Ticket not found' } };
    const event = EVENTS[ticket.eventId] || null;
    return { status: 200, body: { ticket, event } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

module.exports = { request, capture, list, free, issue, redeem, scan, getTicket };
