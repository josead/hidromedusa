// MetaCall Lambda — Ticket management (no Mercado Pago; WhatsApp + secret phrase).
// Lifecycle: pending -> freed (claim minted) -> used. No user accounts.
// Endpoints (see CONTRACT.md "HTTP API" → Tickets):
//   POST /tickets/request   (public) { type, buyerName, buyerEmail?, buyerPhone?, merchIdea? } → { ticket }
//   GET  /tickets           (staff)  ?status= → { tickets, events, current }
//   POST /tickets/:id/free  (staff)  { staffToken } → { ticket }
//   POST /tickets/issue     (staff)  { type, buyerName, ..., staffToken } → { ticket }
//   POST /tickets/redeem    (public) { claim } → { ticket, event }
//   POST /tickets/evolve    (QR de la noche) { claim, code } → { ticket, event, rasgo, evolved | already }
//   POST /tickets/:id/scan  (staff)  { staffToken } → { valid, ticket, reason? }
//   GET  /tickets/:id       (staff)  → { ticket, event }
//   POST /tickets/:id/rename (staff) { buyerName, staffToken } → { ticket }
//   POST /tickets/invites       (staff)  { count?, note?, staffToken } → { invites }
//   POST /tickets/invite/check  (public) { code } → { ok, event } | 404 | 409 | 410 (fecha pasada)
//   POST /tickets/invite/claim  (public) { code, buyerName, buyerPhone?, buyerEmail? } → { ticket, event } | 410
//   POST /tickets/lists         (clave)  { clave } → { paid, guests, cancelled, invitesUnused, evolved, event, at } (fecha vigente)

const crypto = require('crypto');
const store = require('../lib/store');
const claimcode = require('../lib/claimcode');
const email = require('../lib/email');

// Lifecycle order — status only ever moves FORWARD (never downgrades).
const STATUS_RANK = { lead: 0, pending: 1, freed: 2, used: 3, cancelled: 3 };
const rank = (s) => (s in STATUS_RANK ? STATUS_RANK[s] : -1);

// In-file event map (hardcoded fallback per CONTRACT.md "Event"). Una entrada por fecha:
// las viejas conservan su eventId (y se ven como "Recuerdo"); las nuevas nacen con CURRENT_EVENT.
const EVENTS = {
  'ev-1': {
    id: 'ev-1',
    name: 'Hidromedusa · Fechón estelar',
    date: '2026-10-31',
    time: '21:00',
    end: '2026-11-01T03:00:00-03:00',
    venue: '990 Espacio Cultural, Tandil',
  },
  'ev-2': {
    id: 'ev-2',
    name: 'Hidromedusa · Los Rojos',
    date: '2026-12-04',
    time: '',   // hora a confirmar
    free: true, // entrada libre: el panel arma el mensaje de la palabra sin entrada-sticker
    end: '2026-12-05T06:00:00-03:00',   // holgado mientras no hay hora
    venue: 'Los Rojos (Pinto 35), Tandil',
  },
};
const CURRENT_EVENT = 'ev-2';

// Pasado el fin del evento ya no se anota gente (las invitaciones sin usar mueren).
const eventOver = (ev) => !!(ev && ev.end) && Date.now() > Date.parse(ev.end);
const PAST_INVITE = { status: 410, body: { error: 'Esa invitación era para una fecha que ya pasó' } };

// Evolución: la medusa de una fecha anterior que vuelve a otra sube un nivel y gana un rasgo.
// Se marca con el QR de la noche (hidromedusa.com/?evo=<código>), abierto de `from` al `end`
// de la fecha. Cada fecha tiene su código, y va hasheado porque el repo es público:
// printf %s 'CODIGO' | sha256sum  (ver CLAUDE.md). Va aparte de EVENTS porque EVENTS sale al público.
const EVO = {
  'ev-2': { from: '2026-12-04T18:00:00-03:00', codeSha256: 'd2f6d3f695300c62eb87fcaf78d33807d8a10108e3d5340a059d403dd2b5d354' },
};
// Los mismos que dibuja public/js/jellyfish.js (RASGOS).
const RASGOS = ['corona', 'espiral', 'destello', 'aura', 'velo', 'brazos', 'trebol', 'lunares', 'cometa', 'faro'];

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

// Patch that sets a SPECIFIC (staff-chosen) claim on a ticket — keeps status.
function claimPatch(ticket, claim) {
  const claimNorm = claimcode.normalize(claim);
  const qrData = Buffer.from(JSON.stringify({
    id: ticket.id, claim, type: ticket.type, eventId: ticket.eventId,
  })).toString('base64');
  return { claim, claimNorm, qrData };
}

// Build a fresh pending ticket record from a request body.
function newTicket(body) {
  const { type, buyerName, buyerEmail, buyerPhone, merchIdea } = body;
  return {
    id: makeId(),
    type,
    eventId: CURRENT_EVENT,
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
    let id = leadId || makeId();
    let existing = leadId ? await store.tickets.get(id) : null;
    // El leadId vive en el navegador entre fechas: si apunta a la entrada de una fecha
    // anterior, el pedido nuevo va a un registro aparte y la vieja queda como estaba.
    if (existing && existing.eventId !== CURRENT_EVENT) {
      id = `${leadId}-${CURRENT_EVENT}`;
      existing = await store.tickets.get(id);
    }
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
      // Aviso interno: lead nuevo (o "pidió entrada" si nació pending).
      await email.sendLeadNotification({ ticket, kind: ticket.status === 'pending' ? 'pending' : 'lead' })
        .catch((e) => console.error('[capture] notify error:', e && e.message));
      return { status: 200, body: { ticket } };
    }

    // MERGE: don't override existing values with null; status only advances.
    const patch = { updatedAt: now };
    if (name)    patch.buyerName  = name;
    if (eml)     patch.buyerEmail = eml;
    if (phone)   patch.buyerPhone = phone;
    if (channel) patch.channel    = channel;
    const becamePending = wantStatus === 'pending' && rank('pending') > rank(existing.status);
    if (rank(wantStatus) > rank(existing.status)) patch.status = wantStatus;

    const updated = await store.tickets.update(id, patch);
    // Aviso interno solo cuando un lead existente recién pasa a "pidió entrada".
    if (becamePending) {
      await email.sendLeadNotification({ ticket: updated, kind: 'pending' })
        .catch((e) => console.error('[capture] notify error:', e && e.message));
    }
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

// STAFF: list tickets (all events), optional ?status= filter. `events` + `current`
// let the panel filter by fecha.
async function list(req) {
  if (!requireStaff(req)) return { status: 401, body: { error: 'Staff token required' } };
  try {
    const status = req.query?.status;
    const tickets = await store.tickets.list({ status });
    return { status: 200, body: { tickets, events: Object.values(EVENTS), current: CURRENT_EVENT } };
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

// STAFF: change a ticket's palabra. With body.claim → set that exact phrase
// (must be unique); without → mint a fresh random one. Emails the new palabra.
async function reword(req) {
  if (!requireStaff(req)) return { status: 401, body: { error: 'Staff token required' } };
  try {
    const id = req.params?.id;
    const ticket = await store.tickets.get(id);
    if (!ticket) return { status: 404, body: { error: 'Ticket not found' } };
    if (ticket.status !== 'freed') {
      return { status: 400, body: { error: 'Solo se puede cambiar la palabra de una entrada válida' } };
    }
    const oldClaim = ticket.claim;
    const custom = (req.body && typeof req.body.claim === 'string') ? req.body.claim.trim() : '';
    let patch;
    if (custom) {
      const norm = claimcode.normalize(custom);
      if (!norm) return { status: 400, body: { error: 'Palabra inválida' } };
      const taken = await store.tickets.byClaim(norm);
      if (taken && taken.id !== id) return { status: 409, body: { error: 'Esa palabra ya está en uso' } };
      patch = claimPatch(ticket, custom);
    } else {
      const fp = await freePatch(ticket);
      patch = { claim: fp.claim, claimNorm: fp.claimNorm, qrData: fp.qrData };
    }
    const updated = await store.tickets.update(id, patch);
    await email.sendPalabraChanged({ to: updated.buyerEmail, name: updated.buyerName, claim: updated.claim, oldClaim })
      .catch((e) => console.error('[tickets.reword] email error:', e && e.message));
    return { status: 200, body: { ticket: updated, oldClaim } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// STAFF: invalidate a ticket. Keeps the record (status 'cancelled') so the palabra
// stops working in redeem/scan, and emails the buyer that it was invalidated.
async function cancel(req) {
  if (!requireStaff(req)) return { status: 401, body: { error: 'Staff token required' } };
  try {
    const id = req.params?.id;
    const ticket = await store.tickets.get(id);
    if (!ticket) return { status: 404, body: { error: 'Ticket not found' } };
    if (ticket.status === 'cancelled') return { status: 200, body: { ticket } };
    const updated = await store.tickets.update(id, {
      status: 'cancelled', cancelledAt: new Date().toISOString(),
    });
    await email.sendTicketCancelled({ to: updated.buyerEmail, name: updated.buyerName })
      .catch((e) => console.error('[tickets.cancel] email error:', e && e.message));
    return { status: 200, body: { ticket: updated } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// STAFF: fix the name on any ticket (e.g. "Isabela Ibarra" → "Isabela Ibarra x 2").
// Only the name changes: palabra, status and dates stay; no email.
async function rename(req) {
  if (!requireStaff(req)) return { status: 401, body: { error: 'Staff token required' } };
  const raw = req.body && typeof req.body.buyerName === 'string' ? req.body.buyerName : '';
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return { status: 400, body: { error: 'Falta el nombre' } };
  if (name.length > 80) return { status: 400, body: { error: 'Nombre demasiado largo' } };
  try {
    const id = req.params?.id;
    const ticket = await store.tickets.get(id);
    if (!ticket) return { status: 404, body: { error: 'Ticket not found' } };
    const updated = await store.tickets.update(id, { buyerName: name });
    return { status: 200, body: { ticket: updated } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// STAFF: hard-delete a ticket (mistake/test cleanup). No email — the record is gone.
async function remove(req) {
  if (!requireStaff(req)) return { status: 401, body: { error: 'Staff token required' } };
  try {
    const id = req.params?.id;
    const ticket = await store.tickets.get(id);
    if (!ticket) return { status: 404, body: { error: 'Ticket not found' } };
    await store.tickets.remove(id);
    return { status: 200, body: { deleted: true, id } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// Lo único de una entrada que sale por redeem/evolve. La frase se dice en voz alta en la fiesta y
// hay solo 18×18, así que cualquiera puede probarlas todas: nunca nombre, mail ni teléfono.
// Nace en nivel 1 y suma un nivel y un rasgo por cada fecha a la que volvió (`evos`, en orden).
function publicTicket(t) {
  const evos = Object.entries(t.evos || {})
    .sort((a, b) => String(a[1].at).localeCompare(String(b[1].at)))
    .map(([eventId, e]) => ({ eventId, rasgo: e.rasgo, date: (EVENTS[eventId] || {}).date || null }));
  return {
    id: t.id, type: t.type, eventId: t.eventId, claim: t.claim, status: t.status,
    level: 1 + evos.length, rasgos: evos.map((e) => e.rasgo), evos,
  };
}

// La entrada válida de una frase (con medusa), o null.
async function ticketByClaim(claim) {
  const norm = claimcode.normalize(claim);
  if (!norm) return null;
  const ticket = await store.tickets.byClaim(norm);
  return ticket && ticket.claim && ticket.status !== 'cancelled' ? ticket : null;
}

// PUBLIC: redeem a claim phrase → ticket + event (for the ticket card / palabras clave).
async function redeem(req) {
  try {
    const ticket = await ticketByClaim((req.body || {}).claim);
    if (!ticket) return { status: 404, body: { error: 'No encontramos ese código' } };
    const event = EVENTS[ticket.eventId] || null;
    return { status: 200, body: { ticket: publicTicket(ticket), event } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// El rasgo nuevo: uno que la medusa todavía no tenga, elegido por su frase y la fecha. Al no ser
// al azar, un doble toque en el QR escribe lo mismo dos veces y no hace falta un update condicional.
function pickRasgo(ticket) {
  const owned = Object.values(ticket.evos || {}).map((e) => e.rasgo);
  const free = RASGOS.filter((r) => !owned.includes(r));
  const pool = free.length ? free : RASGOS;
  const h = crypto.createHash('sha256').update(`${ticket.claimNorm}|${CURRENT_EVENT}`).digest();
  return pool[h.readUInt32BE(0) % pool.length];
}

// PUBLIC (con el código del QR de la noche): la medusa de esa frase sube un nivel y gana un rasgo.
// Una vez por fecha, y no en la fecha en que nació. Ojo: con el código, cualquier frase evoluciona
// (son 324); alcanza porque el código solo está en la fiesta y no da nada más que el dibujo.
async function evolve(req) {
  const body = req.body || {};
  const evo = EVO[CURRENT_EVENT];
  const typed = crypto.createHash('sha256').update(String(body.code || '').trim()).digest();
  if (!evo || !crypto.timingSafeEqual(typed, Buffer.from(evo.codeSha256, 'hex'))) {
    return { status: 403, body: { error: 'Ese QR no es el de esta fecha' } };
  }
  if (Date.now() < Date.parse(evo.from)) {
    return { status: 403, body: { error: 'La evolución se abre en la fiesta' } };
  }
  if (eventOver(EVENTS[CURRENT_EVENT])) {
    return { status: 410, body: { error: 'Esa fiesta ya terminó: tu medusa evoluciona en la próxima fecha' } };
  }
  try {
    const ticket = await ticketByClaim(body.claim);
    if (!ticket) return { status: 404, body: { error: 'No encontramos esa palabra' } };
    const event = EVENTS[ticket.eventId] || null;
    if (ticket.eventId === CURRENT_EVENT) {
      return {
        status: 409,
        body: { error: 'Tu medusa nació esta noche: evoluciona en la próxima fecha', ticket: publicTicket(ticket), event },
      };
    }
    const had = (ticket.evos || {})[CURRENT_EVENT];
    if (had) return { status: 200, body: { ticket: publicTicket(ticket), event, rasgo: had.rasgo, already: true } };
    const rasgo = pickRasgo(ticket);
    const updated = await store.tickets.update(ticket.id, {
      evos: { ...(ticket.evos || {}), [CURRENT_EVENT]: { rasgo, at: new Date().toISOString() } },
    });
    return { status: 200, body: { ticket: publicTicket(updated), event, rasgo, evolved: true } };
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
    if (ticket.status === 'cancelled') {
      return { status: 200, body: { valid: false, reason: 'Entrada invalidada' } };
    }
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

// ── Invitaciones (gratis, de un solo uso) ─────────
// Staff mints codes; each lives in hm_tickets as id INV-<code>, type 'invitado',
// status 'invite'. Whoever uses it with name + contact becomes 'guest' (en la
// lista): no palabra clave ni hidromedusa — en la puerta se lo busca por nombre.
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O, 1/I/L
const inviteId = (code) => `INV-${code}`;

function makeInviteCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += INVITE_ALPHABET[crypto.randomInt(INVITE_ALPHABET.length)];
  return code;
}

// "k7qm-3p " → "K7QM3P"
function normInviteCode(s) {
  return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Invite record for a typed code (any status), or null.
async function findInvite(code) {
  const c = normInviteCode(code);
  if (!c) return null;
  const t = await store.tickets.get(inviteId(c));
  return t && t.type === 'invitado' ? t : null;
}

// STAFF: mint `count` (1–50) one-use invite codes, with an optional note.
async function createInvites(req) {
  if (!requireStaff(req)) return { status: 401, body: { error: 'Staff token required' } };
  const body = req.body || {};
  const count = Math.min(50, Math.max(1, parseInt(body.count, 10) || 1));
  const note = (typeof body.note === 'string' && body.note.trim()) || null;
  try {
    const invites = [];
    for (let i = 0; i < count; i++) {
      let code;
      do { code = makeInviteCode(); } while (await store.tickets.get(inviteId(code)));
      const invite = {
        ...newTicket({ type: 'invitado', buyerName: null }),
        id: inviteId(code),
        inviteCode: code,
        inviteNote: note,
        status: 'invite',
      };
      await store.tickets.put(invite);
      invites.push(invite);
    }
    return { status: 200, body: { invites } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// PUBLIC: is this invite code still usable?
async function checkInvite(req) {
  try {
    const inv = await findInvite(req.body?.code);
    if (!inv || inv.status === 'cancelled') return { status: 404, body: { error: 'Ese código no existe' } };
    if (inv.status !== 'invite') return { status: 409, body: { error: 'Esa invitación ya se usó' } };
    if (eventOver(EVENTS[inv.eventId])) return PAST_INVITE;
    return { status: 200, body: { ok: true, event: EVENTS[inv.eventId] || null } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// PUBLIC: use an invite → name + contact, status 'guest'. One shot: the
// conditional update only lands while the record is still 'invite'.
async function claimInvite(req) {
  const body = req.body || {};
  const name  = (body.buyerName  || '').trim();
  const eml   = (body.buyerEmail || '').trim() || null;
  const phone = (body.buyerPhone || '').trim() || null;
  if (!name) return { status: 400, body: { error: 'Falta tu nombre' } };
  if (!eml && !phone) return { status: 400, body: { error: 'Dejanos un WhatsApp o un email' } };
  try {
    const inv = await findInvite(body.code);
    if (!inv || inv.status === 'cancelled') return { status: 404, body: { error: 'Ese código no existe' } };
    if (eventOver(EVENTS[inv.eventId])) return PAST_INVITE;
    const now = new Date().toISOString();
    const guest = await store.tickets.updateIf(inv.id, 'invite', {
      buyerName: name, buyerEmail: eml, buyerPhone: phone, channel: 'invitacion',
      status: 'guest', registeredAt: now, updatedAt: now,
    });
    if (!guest) return { status: 409, body: { error: 'Esa invitación ya se usó' } };
    await email.sendLeadNotification({ ticket: guest, kind: 'invite' })
      .catch((e) => console.error('[tickets.claimInvite] notify error:', e && e.message));
    return {
      status: 200,
      body: { ticket: { id: guest.id, buyerName: guest.buyerName, status: guest.status }, event: EVENTS[guest.eventId] || null },
    };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

// Clave de /listas/ (la que se pasa a puerta y barra). Va hasheada porque el repo es
// público. Para cambiarla: printf %s 'nueva' | sha256sum
const LISTS_KEY_SHA256 = 'bfc89bdc0fc4091f03f03b6d98e8f66cda8e29d8ac197043392e0b6a0b20518c';

// PUBLIC (con clave): lo justo para armar la lista de puerta de la fecha vigente, sin
// contactos, y las medusas que evolucionaron esta noche (solo frase y rasgo).
async function lists(req) {
  const typed = crypto.createHash('sha256').update(String(req.body?.clave || '').trim()).digest();
  if (!crypto.timingSafeEqual(typed, Buffer.from(LISTS_KEY_SHA256, 'hex'))) {
    return { status: 401, body: { error: 'Clave incorrecta' } };
  }
  try {
    const every = await store.tickets.list();
    const all = every.filter((t) => t.eventId === CURRENT_EVENT);
    const pick = (t) => ({ claim: t.claim || null, buyerName: t.buyerName || '', status: t.status });
    const evolved = every.filter((t) => t.claim && t.evos && t.evos[CURRENT_EVENT])
      .sort((a, b) => String(a.evos[CURRENT_EVENT].at).localeCompare(String(b.evos[CURRENT_EVENT].at)))
      .map((t) => ({ claim: t.claim, rasgo: t.evos[CURRENT_EVENT].rasgo, level: 1 + Object.keys(t.evos).length }));
    return {
      status: 200,
      body: {
        paid: all.filter((t) => (t.status === 'freed' || t.status === 'used') && t.claim).map(pick),
        guests: all.filter((t) => t.status === 'guest').map(pick),
        cancelled: all.filter((t) => t.status === 'cancelled' && t.claim).map(pick),
        invitesUnused: all.filter((t) => t.status === 'invite').length,
        evolved,
        event: EVENTS[CURRENT_EVENT],
        at: new Date().toISOString(),
      },
    };
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

module.exports = {
  request, capture, list, free, issue, reword, cancel, rename, remove, redeem, evolve, scan, getTicket,
  createInvites, checkInvite, claimInvite, lists,
};
