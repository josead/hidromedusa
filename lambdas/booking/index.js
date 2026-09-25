// MetaCall Lambda — Propuestas de fecha ("Proponernos una fecha" en la web)
// Endpoint:
//   POST /booking/request (public) { tipo, fecha, flexible, lugar, gente, momento,
//                                    sonido, nombre, contacto, mensaje, channel, leadId }
//        → { ok:true }
// No se guarda en DynamoDB: la conversación sigue por WhatsApp/email (el usuario
// la manda desde su app). Esto sólo avisa al staff por mail para que nada se pierda.

const email = require('../lib/email');

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

async function request(req) {
  const b = req.body || {};
  const booking = {
    tipo: clip(b.tipo, 60), fecha: clip(b.fecha, 10), flexible: !!b.flexible,
    lugar: clip(b.lugar, 160), gente: clip(b.gente, 40), momento: clip(b.momento, 40),
    sonido: clip(b.sonido, 40), nombre: clip(b.nombre, 80), contacto: clip(b.contacto, 120),
    mensaje: clip(b.mensaje, 1200), channel: clip(b.channel, 20), leadId: clip(b.leadId, 40),
    at: new Date().toISOString(),
  };
  if (!booking.nombre || !booking.contacto) {
    return { status: 400, body: { error: 'Falta nombre o contacto' } };
  }
  if (booking.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(booking.fecha)) booking.fecha = '';
  console.log('[booking] request', JSON.stringify(booking));
  await email.sendBookingNotification({ booking }).catch(e => console.error('[booking] notify failed:', e && e.message));
  return { status: 200, body: { ok: true } };
}

module.exports = { request };
