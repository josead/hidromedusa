// MetaCall Lambda — Mercado Pago
// Endpoints:
//   POST /mercadopago/create-preference  { ticket, price, buyer }  → { init_point, id }
//   POST /mercadopago/webhook            MP webhook handler
//   GET  /mercadopago/status/:id         → { status, ticket }

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_API = 'https://api.mercadopago.com';
const WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;

// In-memory order store (use DB in prod)
const orders = new Map();

async function createPreference(req) {
  const { ticket, price, buyer } = req.body || {};
  if (!ticket || !price || !buyer) {
    return { status: 400, body: { error: 'Missing ticket, price, or buyer' } };
  }

  const ticketNames = { general: 'Entrada General', flashero: 'Entrada Flashera', abismal: 'Entrada Abismal' };
  const orderId = `HM-${Date.now()}`;

  try {
    const res = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        items: [{
          id: ticket,
          title: ticketNames[ticket] || 'Entrada Hidromedusa',
          quantity: 1,
          unit_price: price,
          currency_id: 'ARS',
        }],
        payer: {
          name: buyer.name,
          email: buyer.email || 'invitado@hidromedusa.com',
        },
        back_urls: {
          success: `${process.env.APP_URL || 'https://hidromedusa.com'}/#perfil`,
          failure: `${process.env.APP_URL || 'https://hidromedusa.com'}/#entradas`,
          pending: `${process.env.APP_URL || 'https://hidromedusa.com'}/#entradas`,
        },
        auto_return: 'approved',
        external_reference: orderId,
        notification_url: `${process.env.API_URL || 'https://api.hidromedusa.com'}/mercadopago/webhook`,
        statement_descriptor: 'HIDROMEDUSA',
      }),
    });

    const data = await res.json();
    if (!res.ok) return { status: res.status, body: { error: data.message } };

    orders.set(orderId, { orderId, ticket, price, buyer, status: 'pending', preferenceId: data.id });

    return {
      status: 200,
      body: {
        id: orderId,
        preference_id: data.id,
        init_point: data.init_point,
        sandbox_init_point: data.sandbox_init_point,
      }
    };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

async function webhook(req) {
  const { type, data } = req.body || {};

  // Verify signature in prod
  // const xSignature = req.headers?.['x-signature'];
  // if (!verifySignature(xSignature, req.rawBody, WEBHOOK_SECRET)) { ... }

  if (type === 'payment' && data?.id) {
    try {
      const payRes = await fetch(`${MP_API}/v1/payments/${data.id}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const payment = await payRes.json();
      const order = orders.get(payment.external_reference);

      if (order) {
        order.status = payment.status;
        order.paymentId = data.id;
        orders.set(payment.external_reference, order);

        if (payment.status === 'approved') {
          // TODO: send confirmation email / push notification
          console.log(`✅ Pago aprobado: ${payment.external_reference} — ${order.buyer?.email}`);
        }
      }
    } catch (err) {
      console.error('Webhook error:', err.message);
    }
  }

  return { status: 200, body: { received: true } };
}

async function getStatus(req) {
  const id = req.params?.id || req.query?.id;
  if (!id) return { status: 400, body: { error: 'Missing id' } };
  const order = orders.get(id);
  if (!order) return { status: 404, body: { error: 'Order not found' } };
  return { status: 200, body: order };
}

module.exports = { createPreference, webhook, getStatus };
