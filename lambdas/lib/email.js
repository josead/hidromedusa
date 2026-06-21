// Email sending — AWS SES stub.
//
// TODO (no enviar todavía): falta verificar el dominio hidromedusa.com en SES,
// salir del sandbox y configurar el remitente entrada@hidromedusa.com. Mientras
// tanto esta función NO envía nada: loguea y devuelve { skipped:true }.
//
// Cuando esté listo:
//   1) En SES (región del Lambda) verificar el dominio + DKIM.
//   2) Pedir salida del sandbox (o verificar destinatarios de prueba).
//   3) Dar al rol de ejecución permiso ses:SendEmail.
//   4) Setear env SES_FROM="Hidromedusa <entrada@hidromedusa.com>" y SES_ENABLED=1.
// El SDK v3 (@aws-sdk/client-ses) lo provee el runtime de Lambda — sin bundling.

const FROM    = process.env.SES_FROM || 'Hidromedusa <entrada@hidromedusa.com>';
const ENABLED = process.env.SES_ENABLED === '1';
const REGION  = process.env.SES_REGION || process.env.AWS_REGION || 'sa-east-1';

// Confirmación de entrada con la palabra icebreaker.
async function sendTicketConfirmation({ to, name, claim }) {
  if (!to) return { skipped: true, reason: 'no-recipient' };

  const subject = '🪼 Tu palabra para Hidromedusa';
  const text = [
    `¡Hola ${name || ''}!`.trim(),
    '',
    'Confirmamos tu entrada para Hidromedusa · 990 Espacio Cultural (Sáb 11 Jul, 20:00 a 03:00).',
    '',
    `Tu palabra icebreaker (dos palabras): ${claim}`,
    '',
    'Decila en la puerta y te damos tu entrada-sticker. Si tu palabra matchea con la de',
    'otra persona en la fiesta, se presentan y ganan una consumición. 🍹',
    '',
    '— Hidromedusa',
  ].join('\n');

  if (!ENABLED) {
    console.log(`[email] SKIPPED (TODO SES) → to=${to} claim=${claim}`);
    return { skipped: true, reason: 'ses-disabled-todo' };
  }

  // ── Envío real (activado con SES_ENABLED=1) ─────────────────────────────────
  try {
    const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
    const ses = new SESClient({ region: REGION });
    await ses.send(new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: text, Charset: 'UTF-8' } },
      },
    }));
    return { sent: true };
  } catch (err) {
    console.error('[email] SES send failed:', err && err.message ? err.message : err);
    return { skipped: true, reason: 'ses-error', error: err && err.message };
  }
}

module.exports = { sendTicketConfirmation };
