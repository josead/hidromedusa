// MetaCall Lambda — Ticket management
// Endpoints:
//   POST /tickets/issue     { userId, type, eventId, paymentId } → { ticket }
//   GET  /tickets/:id       → { ticket }
//   POST /tickets/:id/scan  { staffToken } → { valid, ticket }
//   GET  /tickets/user/:uid → [tickets]

const crypto = require('crypto');

// In-memory store (use DynamoDB in prod)
const tickets = new Map();
const events = new Map([
  ['ev-1', { id:'ev-1', name:'Solsticio de Invierno', date:'2026-06-21', time:'22:00', venue:'Buenos Aires', capacity:300 }],
  ['ev-2', { id:'ev-2', name:'Noches del Kraken', date:'2026-07-12', time:'21:00', venue:'Buenos Aires', capacity:250 }],
]);

async function issueTicket(req) {
  const { userId, type, eventId, paymentId } = req.body || {};
  if (!userId || !type) return { status: 400, body: { error: 'Missing userId or type' } };

  const ticketId = `HM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const qrData = Buffer.from(JSON.stringify({ ticketId, userId, type, eventId })).toString('base64');

  const ticket = {
    id: ticketId,
    userId,
    type,
    eventId: eventId || 'ev-1',
    paymentId,
    qrData,
    issuedAt: new Date().toISOString(),
    used: false,
    usedAt: null,
  };

  tickets.set(ticketId, ticket);

  return { status: 200, body: ticket };
}

async function getTicket(req) {
  const id = req.params?.id;
  const ticket = tickets.get(id);
  if (!ticket) return { status: 404, body: { error: 'Ticket not found' } };
  const event = events.get(ticket.eventId);
  return { status: 200, body: { ...ticket, event } };
}

async function scanTicket(req) {
  const id = req.params?.id;
  const { staffToken } = req.body || {};

  // Verify staff token (simplified)
  if (!staffToken) return { status: 401, body: { error: 'Staff token required' } };

  const ticket = tickets.get(id);
  if (!ticket) return { status: 404, body: { valid: false, reason: 'Ticket not found' } };
  if (ticket.used) return { status: 200, body: { valid: false, reason: 'Ticket already used', usedAt: ticket.usedAt } };

  ticket.used = true;
  ticket.usedAt = new Date().toISOString();
  tickets.set(id, ticket);

  return { status: 200, body: { valid: true, ticket } };
}

async function getUserTickets(req) {
  const uid = req.params?.uid;
  if (!uid) return { status: 400, body: { error: 'Missing uid' } };
  const userTickets = [...tickets.values()].filter(t => t.userId === uid);
  return { status: 200, body: userTickets };
}

module.exports = { issueTicket, getTicket, scanTicket, getUserTickets };
