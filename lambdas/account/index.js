// MetaCall Lambda — Cuenta opcional con Google: qué medusas son tuyas, para no perderlas si se
// borra el navegador. Sin sesiones: cada pedido trae el ID token fresco de Google Identity Services
// (`credential`) y se verifica acá. Se guarda solo el id de la cuenta (sub) y qué entradas guardó;
// nada de mail ni nombre.
// Endpoints (see CONTRACT.md "HTTP API" → Cuenta):
//   POST /account/save     { credential, claim } → { medusas: [{ ticket, event }] } | 401 | 404 | 503
//   POST /account/medusas  { credential }        → { medusas: [{ ticket, event }] } | 401 | 503
// `medusas` va de la última guardada a la primera. 503 = falta GOOGLE_CLIENT_ID (cuenta apagada).

const store = require('../lib/store');
const { verifyIdToken } = require('../lib/google');
const tickets = require('../tickets/index');

const MAX = 20; // medusas por cuenta

async function who(body) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return { fail: { status: 503, body: { error: 'La cuenta todavía no está disponible' } } };
  const id = await verifyIdToken(body.credential, clientId);
  if (!id) return { fail: { status: 401, body: { error: 'No pudimos verificar tu cuenta de Google' } } };
  return { sub: id.sub };
}

// Cada medusa guardada es { id, claimNorm }: si el staff le cambia la frase (reword) o la cancela,
// deja de aparecer, así quien guardó la frase vieja no se entera de la nueva.
async function resolve(saved) {
  const found = await Promise.all(saved.map((m) => store.tickets.get(m.id)));
  return saved
    .map((m, i) => ({ m, t: found[i] }))
    .filter(({ m, t }) => t && t.claim && t.status !== 'cancelled' && t.claimNorm === m.claimNorm);
}

const out = (list) => list.map(({ t }) => ({ ticket: tickets.publicTicket(t), event: tickets.EVENTS[t.eventId] || null }));

// La frase de la medusa que se está viendo entra primera; las que ya no valen se limpian.
async function save(req) {
  const body = req.body || {};
  try {
    const w = await who(body);
    if (w.fail) return w.fail;
    const t = await tickets.ticketByClaim(body.claim);
    if (!t) return { status: 404, body: { error: 'No encontramos esa palabra' } };
    const now = new Date().toISOString();
    const acc = (await store.accounts.get(w.sub)) || { sub: w.sub, createdAt: now };
    const wanted = [{ id: t.id, claimNorm: t.claimNorm }, ...(acc.medusas || []).filter((m) => m.id !== t.id)].slice(0, MAX);
    const list = await resolve(wanted);
    await store.accounts.put({ ...acc, medusas: list.map(({ m }) => m), updatedAt: now });
    return { status: 200, body: { medusas: out(list) } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

async function medusas(req) {
  const body = req.body || {};
  try {
    const w = await who(body);
    if (w.fail) return w.fail;
    const acc = await store.accounts.get(w.sub);
    return { status: 200, body: { medusas: out(await resolve((acc && acc.medusas) || [])) } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

module.exports = { save, medusas };
