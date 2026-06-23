// Email sending — AWS SES (sesv2 vía @aws-sdk/client-ses, lo provee el runtime).
// Tres mails, todos estilados como la web (abismo + ácido + Anton con fallback):
//   1) sendTicketConfirmation  — entrada confirmada + palabra + botón Calendar
//   2) sendPalabraChanged      — la palabra cambió (la anterior ya no sirve)
//   3) sendTicketCancelled     — la entrada fue invalidada (acento rosa)
// El botón de calendario usa el MISMO link que el sitio (buildGoogleCalUrl).
//
// Env: SES_FROM, SES_ENABLED ('1' para enviar), SES_REGION.

const FROM    = process.env.SES_FROM || 'Hidromedusa <entrada@hidromedusa.com>';
const ENABLED = process.env.SES_ENABLED === '1';
const REGION  = process.env.SES_REGION || process.env.AWS_REGION || 'sa-east-1';

// ── Evento (espejo del HM_EVENT hardcodeado en public/index.html) ────────────
const EVENT = {
  title:    'Hidromedusa · 990 Espacio Cultural',
  start:    '2026-07-11T21:00:00-03:00',
  end:      '2026-07-12T03:00:00-03:00',
  venue:    '990 Espacio Cultural, Tandil, Buenos Aires, AR',
  dateLabel:'Sáb 11 Jul 2026',
  timeLabel:'21:00 a 03:00',
};
const SITE      = 'https://hidromedusa.com';
const CONTACT   = 'hola@hidromedusa.com';
const STAFF_URL = SITE + '/staff-admin-secreto/';
// A dónde llegan los avisos internos de leads/compras (verificado en SES).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'chamot11@gmail.com';

// Paleta + tipografías (con fallback para clientes sin web fonts: Gmail/Outlook).
const C = {
  bone: '#ECE7DA', acid: '#C6FF1A', hot: '#FF2E88',
  abyss: '#060607', panel: '#0d0e10', muted: '#8a857c', line: 'rgba(236,231,218,0.16)',
};
const F = {
  display: `'Anton','Arial Narrow','Helvetica Neue',Impact,sans-serif`,
  body: `'Helvetica Neue',Arial,sans-serif`,
  mono: `'Space Mono','Courier New',monospace`,
};

// Mismo formato que el sitio: ISO → UTC compacto YYYYMMDDTHHMMSSZ.
function fmtICS(d) {
  return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
// Mismo link de calendario que buildGoogleCalUrl() en la web.
function googleCalUrl() {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: EVENT.title,
    dates: fmtICS(EVENT.start) + '/' + fmtICS(EVENT.end),
    details: 'Hidromedusa en vivo. Entradas por WhatsApp.',
    location: EVENT.venue,
  });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

// "fosforo-abisal" → "FOSFORO ABISAL" (el match en puerta es por palabra).
const prettyClaim = (c) => String(c || '').replace(/-/g, ' ').toUpperCase();
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Bloques HTML reutilizables (email-safe: tablas + estilos inline) ─────────
function pad(inner, top = 22) {
  return `<tr><td style="padding:${top}px 34px 0;">${inner}</td></tr>`;
}
function text(html, top = 22) {
  return pad(`<div style="font-family:${F.body};font-size:15px;line-height:1.55;color:${C.bone};">${html}</div>`, top);
}
function claimBox(label, claim, color = C.acid) {
  return pad(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.panel}" style="background:${C.panel};border:1px solid ${color};">
      <tr><td style="padding:22px 26px;">
        <div style="font-family:${F.mono};font-size:11px;letter-spacing:3px;color:${C.muted};text-transform:uppercase;">${label}</div>
        <div style="font-family:${F.display};font-size:46px;line-height:1;letter-spacing:1px;color:${color};text-transform:uppercase;padding-top:10px;">${esc(prettyClaim(claim))}</div>
      </td></tr>
    </table>`, 24);
}
function eventDetails() {
  return pad(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-family:${F.mono};font-size:11px;letter-spacing:2px;color:${C.muted};text-transform:uppercase;padding-bottom:4px;">Fecha</td>
        <td style="font-family:${F.mono};font-size:11px;letter-spacing:2px;color:${C.muted};text-transform:uppercase;padding-bottom:4px;">Horario</td>
      </tr>
      <tr>
        <td style="font-family:${F.body};font-size:16px;color:${C.bone};font-weight:bold;padding-bottom:14px;">${EVENT.dateLabel}</td>
        <td style="font-family:${F.body};font-size:16px;color:${C.bone};font-weight:bold;padding-bottom:14px;">${EVENT.timeLabel}</td>
      </tr>
      <tr><td colspan="2" style="font-family:${F.mono};font-size:11px;letter-spacing:2px;color:${C.muted};text-transform:uppercase;padding-bottom:4px;">Lugar</td></tr>
      <tr><td colspan="2" style="font-family:${F.body};font-size:16px;color:${C.bone};font-weight:bold;">990 Espacio Cultural · Tandil, BA</td></tr>
    </table>`);
}
function calButton(calUrl) {
  return pad(`
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td bgcolor="${C.acid}" style="background:${C.acid};">
        <a href="${esc(calUrl)}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${F.mono};font-size:14px;font-weight:bold;letter-spacing:1px;color:${C.abyss};text-transform:uppercase;text-decoration:none;">📅 Agendar la fecha</a>
      </td>
    </tr></table>
    <div style="font-family:${F.body};font-size:13px;color:${C.muted};padding-top:8px;">Se abre en Google Calendar con la fecha cargada.</div>`, 24);
}
function divider() {
  return pad(`<div style="border-top:1px solid ${C.line};font-size:0;line-height:0;">&nbsp;</div>`, 24);
}
// Fila clave/valor para el aviso interno de leads.
function kv(label, val) {
  return `<tr>
    <td style="font-family:${F.mono};font-size:11px;letter-spacing:2px;color:${C.muted};text-transform:uppercase;padding:6px 0;width:120px;vertical-align:top;">${label}</td>
    <td style="font-family:${F.body};font-size:15px;color:${C.bone};padding:6px 0;">${val}</td>
  </tr>`;
}
function adminButton() {
  return pad(`
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td bgcolor="${C.acid}" style="background:${C.acid};">
        <a href="${STAFF_URL}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${F.mono};font-size:14px;font-weight:bold;letter-spacing:1px;color:${C.abyss};text-transform:uppercase;text-decoration:none;">Abrir el panel →</a>
      </td>
    </tr></table>`, 24);
}
const fmtWhen = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; }
  catch (e) { return String(iso); }
};

// Shell: top label + wordmark + sub-label (accent) + filas + footer.
function htmlDoc({ subLabel, accent = C.acid, rows }) {
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Hidromedusa</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Anton&family=Space+Mono&display=swap');
  body{margin:0;padding:0;background:${C.abyss};}
  a{text-decoration:none;}
  @media (max-width:620px){ .wm{font-size:54px!important;} }
</style>
</head>
<body style="margin:0;padding:0;background:${C.abyss};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.abyss}" style="background:${C.abyss};">
<tr><td align="center" style="padding:28px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${C.abyss};border:1px solid ${C.line};">

    <tr><td style="padding:22px 34px 0;font-family:${F.mono};font-size:11px;letter-spacing:3px;color:${C.acid};text-transform:uppercase;">Espécimen Nº001 · Hydromedusae</td></tr>
    <tr><td style="padding:6px 34px 0;">
      <div class="wm" style="font-family:${F.display};font-size:74px;line-height:0.9;letter-spacing:1px;color:${C.bone};text-transform:uppercase;">HIDROMEDUSA</div>
      <div style="font-family:${F.mono};font-size:12px;letter-spacing:4px;color:${accent};text-transform:uppercase;padding-top:8px;">${subLabel}</div>
    </td></tr>

    ${rows}

    ${divider()}
    <tr><td style="padding:16px 34px 30px;font-family:${F.mono};font-size:11px;letter-spacing:2px;color:${C.muted};text-transform:uppercase;">
      <a href="${SITE}" target="_blank" style="color:${C.acid};">hidromedusa.com</a> &nbsp;·&nbsp; Música en vivo desde Tandil
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`;
}

// ── 1) Confirmación ──────────────────────────────────────────────────────────
function renderConfirmationHtml({ name, claim, calUrl }) {
  const rows =
    text(`¡Hola ${esc(name) || 'crack'}! Te esperamos en el fondo. 🪼<br>Tu entrada para <b>Hidromedusa</b> está confirmada.`, 26)
    + claimBox('Tu palabra icebreaker (dos palabras)', claim)
    + eventDetails()
    + calButton(calUrl)
    + text(`<b style="color:${C.acid};">En la puerta:</b> decí tu palabra y te damos tu entrada-sticker.<br><b style="color:${C.acid};">El juego:</b> si tu palabra matchea con la de otra persona, se presentan y ganan una consumición. 🍹`, 26);
  return htmlDoc({ subLabel: 'Entrada confirmada', accent: C.acid, rows });
}
function renderConfirmationText({ name, claim, calUrl }) {
  return [
    `¡Hola ${name || ''}!`.trim(), '',
    `Confirmamos tu entrada para Hidromedusa · 990 Espacio Cultural (${EVENT.dateLabel}, ${EVENT.timeLabel}).`, '',
    `Tu palabra icebreaker (dos palabras): ${claim}`, '',
    'Decila en la puerta y te damos tu entrada-sticker. Si matchea con la de otra persona, se presentan y ganan una consumición.', '',
    `Agendá la fecha: ${calUrl}`, '', `— Hidromedusa · ${SITE}`,
  ].join('\n');
}

// ── 2) Palabra cambiada ──────────────────────────────────────────────────────
function renderPalabraChangedHtml({ name, claim, oldClaim, calUrl }) {
  const oldNote = oldClaim
    ? text(`<span style="color:${C.muted};font-size:13px;">Tu palabra anterior (<b>${esc(prettyClaim(oldClaim))}</b>) ya no es válida.</span>`, 14)
    : '';
  const rows =
    text(`¡Hola ${esc(name) || 'crack'}! Actualizamos tu palabra para <b>Hidromedusa</b>. Esta es la que vale ahora:`, 26)
    + claimBox('Tu nueva palabra (dos palabras)', claim)
    + oldNote
    + eventDetails()
    + calButton(calUrl)
    + text(`<b style="color:${C.acid};">En la puerta:</b> decí tu <b>nueva</b> palabra y te damos tu entrada-sticker. 🪼`, 26);
  return htmlDoc({ subLabel: 'Palabra actualizada', accent: C.acid, rows });
}
function renderPalabraChangedText({ name, claim, oldClaim, calUrl }) {
  return [
    `¡Hola ${name || ''}!`.trim(), '',
    'Actualizamos tu palabra para Hidromedusa.',
    oldClaim ? `Tu palabra anterior (${oldClaim}) ya no sirve.` : '', '',
    `Tu nueva palabra (dos palabras): ${claim}`, '',
    'Decí la nueva en la puerta y te damos tu entrada-sticker.', '',
    `Agendá la fecha: ${calUrl}`, '', `— Hidromedusa · ${SITE}`,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

// ── 3) Entrada invalidada ────────────────────────────────────────────────────
function renderCancelledHtml({ name }) {
  const rows =
    text(`¡Hola ${esc(name) || ''}! Te escribimos para avisarte que tu entrada para <b>Hidromedusa</b> fue <b style="color:${C.hot};">invalidada</b>. Tu palabra ya no sirve para ingresar.`, 26)
    + pad(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.panel}" style="background:${C.panel};border:1px solid ${C.hot};">
        <tr><td style="padding:20px 26px;font-family:${F.display};font-size:30px;letter-spacing:1px;color:${C.hot};text-transform:uppercase;">Entrada invalidada</td></tr>
      </table>`, 24)
    + text(`¿Creés que es un error? Escribinos a <a href="mailto:${CONTACT}" style="color:${C.acid};">${CONTACT}</a> o por Instagram <a href="https://instagram.com/hidromedusa" style="color:${C.acid};">@hidromedusa</a> y lo vemos.`, 24);
  return htmlDoc({ subLabel: 'Entrada invalidada', accent: C.hot, rows });
}
function renderCancelledText({ name }) {
  return [
    `¡Hola ${name || ''}!`.trim(), '',
    'Tu entrada para Hidromedusa fue invalidada. Tu palabra ya no sirve para ingresar.', '',
    `¿Creés que es un error? Escribinos a ${CONTACT} o por Instagram @hidromedusa.`, '',
    `— Hidromedusa · ${SITE}`,
  ].join('\n');
}

// ── Aviso interno: nuevo lead / pidió entrada ────────────────────────────────
function renderLeadNotifyHtml({ ticket, kind }) {
  const isPending = kind === 'pending';
  const accent = isPending ? C.hot : C.acid;
  const intro = isPending
    ? `Alguien apretó <b style="color:${C.hot};">pedir entrada</b>. Generale la palabra desde el panel. 🪼`
    : `Entró un nuevo lead a la base. 🪼`;
  const rows =
    text(intro, 26)
    + pad(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.panel}" style="background:${C.panel};border:1px solid ${accent};">
        <tr><td style="padding:18px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${kv('Nombre', esc(ticket.buyerName) || '—')}
            ${kv('Email', esc(ticket.buyerEmail) || '—')}
            ${kv('WhatsApp', esc(ticket.buyerPhone) || '—')}
            ${kv('Canal', esc(ticket.channel) || '—')}
            ${kv('Estado', esc(ticket.status))}
            ${kv('Cuándo', fmtWhen(ticket.updatedAt || ticket.createdAt))}
            ${kv('ID', esc(ticket.id))}
          </table>
        </td></tr>
      </table>`, 22)
    + adminButton();
  return htmlDoc({ subLabel: isPending ? 'Pidió una entrada' : 'Nuevo lead', accent, rows });
}
function renderLeadNotifyText({ ticket, kind }) {
  return [
    `${kind === 'pending' ? 'Pidió una entrada' : 'Nuevo lead'} — Hidromedusa`, '',
    `Nombre:   ${ticket.buyerName || '—'}`,
    `Email:    ${ticket.buyerEmail || '—'}`,
    `WhatsApp: ${ticket.buyerPhone || '—'}`,
    `Canal:    ${ticket.channel || '—'}`,
    `Estado:   ${ticket.status}`,
    `ID:       ${ticket.id}`, '',
    `Abrí el panel: ${STAFF_URL}`,
  ].join('\n');
}

// ── Envío genérico ───────────────────────────────────────────────────────────
async function send({ to, subject, html, text: txt, tag }) {
  if (!to) return { skipped: true, reason: 'no-recipient' };
  if (!ENABLED) {
    console.log(`[email] SKIPPED (SES_ENABLED!=1) → ${tag} to=${to}`);
    return { skipped: true, reason: 'ses-disabled' };
  }
  try {
    const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
    const ses = new SESClient({ region: REGION });
    const out = await ses.send(new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' }, Text: { Data: txt, Charset: 'UTF-8' } },
      },
    }));
    console.log(`[email] SENT → ${tag} to=${to} messageId=${out && out.MessageId}`);
    return { sent: true, messageId: out && out.MessageId };
  } catch (err) {
    console.error(`[email] SES send FAILED (${tag}):`, err && err.message ? err.message : err);
    return { skipped: true, reason: 'ses-error', error: err && err.message };
  }
}

// ── API pública ──────────────────────────────────────────────────────────────
async function sendTicketConfirmation({ to, name, claim }) {
  const calUrl = googleCalUrl();
  return send({
    to, tag: 'confirmation',
    subject: '🪼 Tu palabra para Hidromedusa',
    html: renderConfirmationHtml({ name, claim, calUrl }),
    text: renderConfirmationText({ name, claim, calUrl }),
  });
}
async function sendPalabraChanged({ to, name, claim, oldClaim }) {
  const calUrl = googleCalUrl();
  return send({
    to, tag: 'palabra-changed',
    subject: '🪼 Tu palabra cambió — Hidromedusa',
    html: renderPalabraChangedHtml({ name, claim, oldClaim, calUrl }),
    text: renderPalabraChangedText({ name, claim, oldClaim, calUrl }),
  });
}
async function sendTicketCancelled({ to, name }) {
  return send({
    to, tag: 'cancelled',
    subject: 'Tu entrada de Hidromedusa fue invalidada',
    html: renderCancelledHtml({ name }),
    text: renderCancelledText({ name }),
  });
}
// Aviso interno al staff (ADMIN_EMAIL) cuando entra un lead o un "pidió entrada".
async function sendLeadNotification({ ticket, kind }) {
  const who = ticket.buyerName || ticket.buyerEmail || ticket.buyerPhone || ticket.id;
  return send({
    to: ADMIN_EMAIL, tag: 'lead-notify-' + kind,
    subject: (kind === 'pending' ? '🔥 Pidió entrada: ' : '🪼 Nuevo lead: ') + who,
    html: renderLeadNotifyHtml({ ticket, kind }),
    text: renderLeadNotifyText({ ticket, kind }),
  });
}

module.exports = {
  sendTicketConfirmation, sendPalabraChanged, sendTicketCancelled, sendLeadNotification,
  renderConfirmationHtml, renderPalabraChangedHtml, renderCancelledHtml, renderLeadNotifyHtml,
  googleCalUrl,
};
