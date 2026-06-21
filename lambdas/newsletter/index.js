// MetaCall Lambda — Newsletter subscribers (DynamoDB via shared store)
// Endpoints:
//   POST /newsletter/subscribe   (public) { email } → { ok:true }
//   GET/POST /newsletter/list    (staff)  { staffToken? } → { subscribers }

const store = require('../lib/store');

// PUBLIC — store a subscriber email. Validates shape, lowercases, dedupes via PK.
async function subscribe(req) {
  try {
    const { email } = req.body || {};
    // Cheap sanity check: must contain an '@' and a dot somewhere.
    if (typeof email !== 'string' || !email.includes('@') || !email.includes('.')) {
      return { status: 400, body: { error: 'Email inválido' } };
    }
    await store.newsletter.add(email.trim().toLowerCase());
    return { status: 200, body: { ok: true } };
  } catch (err) {
    console.error('[newsletter] subscribe failed:', err && err.message ? err.message : err);
    return { status: 500, body: { error: 'Error al suscribir' } };
  }
}

// STAFF — list all subscribers. Gate by STAFF_TOKEN (unset/empty => allow).
async function list(req) {
  const token = process.env.STAFF_TOKEN;
  if (token && (req.body?.staffToken !== token)) {
    return { status: 401, body: { error: 'No autorizado' } };
  }
  try {
    return { status: 200, body: { subscribers: await store.newsletter.list() } };
  } catch (err) {
    console.error('[newsletter] list failed:', err && err.message ? err.message : err);
    return { status: 500, body: { error: 'Error al listar' } };
  }
}

module.exports = { subscribe, list };
