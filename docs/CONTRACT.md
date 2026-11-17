# Hidromedusa — Implementation Contract

Single source of truth for the un-mock pass. All frontend + backend code must
conform to this. Read this fully before editing any file.

## Product model (post-decisions)

- **No Mercado Pago.** Buying a ticket = contacting via **WhatsApp** (prefilled
  message). Staff then "free"/issue the ticket from the staff portal.
- **No forced registration.** A buyer never needs an account to get or show a
  ticket.
- **Claim by secret phrase.** When staff frees a ticket the system mints a
  **two-word Spanish phrase** (e.g. `medusa-violeta`). The buyer enters that
  phrase on the site to pull up their **ticket card** with the palabras clave and
  their **hidromedusa** (NO entry QR; no physical sticker for the current free date).
- **Medusas que evolucionan.** The phrase is kept across dates: at each later date
  the buyer scans the night's QR (`/?evo=CODE`), enters the phrase and the jellyfish
  levels up (more definition + one new rasgo). See "Evolución" below.
- **Membership is hidden** for this pass (no MP, no billing).
- **Cuenta opcional con Google** («Guardar con Google»): solo para no perder la medusa
  si se borra el navegador o cambia de celu. Nunca hace falta para ver o usar la entrada.
  Apagada (sin botones) mientras `GOOGLE_CLIENT_ID` esté vacío. See "Cuenta" below.

## Event (hardcoded fallback)

Una entrada por fecha en `EVENTS` (`lambdas/tickets/index.js`); `CURRENT_EVENT` es la vigente. Las entradas
viejas conservan su `eventId` y se ven como "Recuerdo" con SU fecha y lugar; las nuevas (pedidos, palabras,
invitaciones) nacen con `CURRENT_EVENT`. Si el `leadId` del navegador ya es una entrada de otra fecha,
`POST /tickets/capture` crea un registro aparte `<leadId>-<CURRENT_EVENT>`. `/tickets/lists` es solo de la vigente.

```
id: ev-2   (vigente)
title: Hidromedusa · Los Rojos
date: 2026-12-04 (viernes)  time: a confirmar (start vacío; end holgado 2026-12-05 06:00 -03:00) · invitados: Psico Caldeo, VHS
venue: Los Rojos, Pinto 35, Tandil, Buenos Aires, AR
tickets: entrada libre y gratuita (`free: true`) · se reserva avisando por WhatsApp/IG

id: ev-1   (pasó)
title: Hidromedusa · Fechón estelar en 990
date: 2026-10-31 (sábado) 21:00 (-03:00) → end 2026-11-01 03:00 · DJ invitados: VHS, Marcos Acosta
venue: 990 Espacio Cultural, Tandil · general $10.000 ARS por transferencia
```

## Config (env + window)

Frontend reads a single global set near the top of `index.html`:

```js
window.HM_CONFIG = {
  API_BASE:         '',                // '' => demo/offline fallback mode
  WHATSAPP_NUMBER:  '549XXXXXXXXXX',   // E.164 no '+'
  INSTAGRAM_HANDLE: 'hidromedusa',     // DM (ig.me/m/<handle>)
  ALIAS:            'hidromedusa.tandil', // alias para transferir
  GOOGLE_CLIENT_ID: '',                // Client ID público de Google Identity Services; '' => sin «Guardar con Google»
};
```

Rule: **every real call degrades gracefully.** If `API_BASE` is empty or a
request fails, fall back to the existing local/demo behaviour (localStorage,
toast) so the static site keeps working with zero backend.

Backend env (`.env.example`): `APP_URL`, `API_URL`, `AWS_REGION`,
`DYNAMODB_ENDPOINT` (e.g. `http://localhost:4566` for LocalStack; unset => real
AWS), `DDB_TABLE_PREFIX` (default `hm_`), `STAFF_TOKEN` (shared staff passphrase;
unset => allow all in dev), `WHATSAPP_NUMBER`, `GOOGLE_CLIENT_ID` (el mismo Client ID
público del front; unset => `/account/*` responde 503), Google Calendar vars
(all optional).

## Persistence — DynamoDB (LocalStack-compatible)

AWS SDK **v3** (`@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`). One shared
module `lambdas/lib/store.js` builds a `DynamoDBDocumentClient` honouring
`DYNAMODB_ENDPOINT` / `AWS_REGION`. Tables (prefix `hm_`):

| Table          | PK            | GSI                         | Notes |
|----------------|---------------|-----------------------------|-------|
| `hm_tickets`   | `id` (S)      | `claimNorm-index` on `claimNorm` | ticket records |
| `hm_tasks`     | `panelId` (S) | —                           | one item per panel, attr `tasks` (list) — GLOBAL/shared |
| `hm_newsletter`| `email` (S)   | —                           | subscribers |
| `hm_sessions`  | `token` (S)   | —                           | OAuth sessions (TTL `expiresAt`) — legacy, unused |
| `hm_accounts`  | `sub` (S)     | —                           | cuenta de Google → `medusas:[{ id, claimNorm }]` (la última guardada primero, máx. 20), `createdAt`, `updatedAt`. Sin mail ni nombre |

`store.js` exports a small typed API (implement at least these):

```
tickets.put(t) / tickets.get(id) / tickets.byClaim(norm) / tickets.list({status?}) / tickets.update(id, patch)
tickets.updateIf(id, status, patch)   // conditional on current status; null if it changed (single-use)
tasks.getAll() / tasks.getPanel(panelId) / tasks.putPanel(panelId, tasks)
newsletter.add(email) / newsletter.list()
sessions.put(s) / sessions.get(token) / sessions.del(token)
accounts.get(sub) / accounts.put(a)
```

Plus `lambdas/lib/claimcode.js`: `makePhrase()` → `noun-adjective` from curated
oceanic/rave Spanish wordlists; `normalize(s)` → lowercase + strip accents/spaces.
Ticket issuance retries `makePhrase()` until `tickets.byClaim(normalize(p))` is
empty (uniqueness).

LocalStack: `deploy/localstack/docker-compose.yml` + `deploy/localstack/create-tables.sh`
(idempotent table creation via `aws --endpoint-url`).

## Ticket lifecycle & record shape

```
status: 'pending'  -> created from a buy/WhatsApp request, no claim code yet
        'freed'    -> staff freed it; claim + claimNorm + qrData set
        'used'     -> scanned at the door
        'cancelled'

Invitations (free, type 'invitado', id `INV-<CODE>`, no claim phrase):
        'invite'   -> staff minted a single-use code (inviteCode, inviteNote)
        'guest'    -> someone used it: name + contact set, on the guest list
                      (looked up by name at the door; no claim/claimNorm/qrData)
```

```js
{
  id, type, eventId,
  buyerName, buyerEmail|null, buyerPhone|null, merchIdea|null,
  claim|null, claimNorm|null, qrData|null,        // set on free
  status, issuedBy|null,
  createdAt, freedAt|null, usedAt|null,
  inviteCode?, inviteNote?, registeredAt?          // invitations only (channel 'invitacion')
  evos?: { [eventId]: { rasgo, at } }              // evolutions, one per later date (QR de la noche)
}
```

### Evolución (QR de la noche)

The jellyfish lives on the **birth ticket** (the phrase is unique across the table):
level = 1 + number of `evos`; the drawing is `JellyfishGen.render(canvas, noun, adj,
{ level, rasgos })` (`public/js/jellyfish.js`: level 1 = the original 28×44 pixel art,
level 2+ = 56×88 with dithering, continuous pulse and the rasgos earned).

- Each date has a secret code printed as a QR at the party → `https://hidromedusa.com/?evo=CODE`.
  Only its sha256 goes in `EVO` (`lambdas/tickets/index.js`), apart from the public `EVENTS`;
  the plaintext stays outside the repo.
- Window: from `EVO[CURRENT_EVENT].from` to `EVENTS[CURRENT_EVENT].end`.
- One evolution per date, never on the birth date. The new rasgo is deterministic
  (sha256 of `claimNorm|eventId`, among the ones not owned yet), so a double tap gets the same one.
- `RASGOS` in the Lambda must match `RASGOS` in `jellyfish.js`:
  `corona, espiral, destello, aura, velo, brazos, trebol, lunares, cometa, faro`.

Invite codes: 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L);
input is upper-cased and stripped of non-alphanumerics. Single use is enforced
with `tickets.updateIf(id, 'invite', …)` (DynamoDB ConditionExpression).

`qrData` = base64 of `JSON.stringify({ id, claim, type, eventId })`.

## HTTP API (MetaCall endpoints — keep `metacall.json` in sync)

Staff-gated routes require `staffToken` (body) matching `STAFF_TOKEN`
(unset => allow). Public routes need nothing.

Tickets:
- `POST /tickets/request`  (public) `{ type, buyerName, buyerEmail?, buyerPhone?, merchIdea? }` → `{ ticket }` (status `pending`). Used to log a WhatsApp lead. Best-effort.
- `GET  /tickets`          (staff)  `?status=` → `{ tickets, events, current }` (el panel filtra por `eventId`, por defecto la vigente)
- `POST /tickets/:id/free` (staff)  `{ staffToken }` → `{ ticket }` (mints claim, sets `freed`)
- `POST /tickets/issue`    (staff)  `{ type, buyerName, ..., staffToken }` → `{ ticket }` (create + free in one step)
- `POST /tickets/redeem`   (public) `{ claim }` → `{ ticket:{ id, type, eventId, claim, status, level, rasgos, evos:[{ eventId, rasgo, date }] }, event }` (lookup by claimNorm; 404 if none or cancelled). Sin nombre ni contactos: hay 18×18 frases y se dicen en voz alta. `event` = la fecha en que nació.
- `POST /tickets/evolve`   (public) `{ claim, code }` → `{ ticket, event, rasgo, evolved:true }` or `{ ticket, event, rasgo, already:true }` (ya evolucionó en esta fecha). 403 QR de otra fecha / antes de `from`, 410 la fecha ya terminó, 404 palabra desconocida o anulada, 409 `{ error, ticket, event }` nació esta noche.
- `POST /tickets/:id/scan` (staff)  `{ staffToken }` → `{ valid, ticket, reason? }`
- `GET  /tickets/:id`      (staff)  → `{ ticket }`
- `POST /tickets/:id/rename` (staff) `{ buyerName, staffToken }` → `{ ticket }` (only the name changes; no email)
- `POST /tickets/invites`  (staff)  `{ count?=1 (max 50), note?, staffToken }` → `{ invites:[ticket] }` (status `invite`)
- `POST /tickets/lists` (clave) `{ clave }` → `{ paid, guests, cancelled:[{claim,buyerName,status}], invitesUnused, evolved:[{claim,rasgo,level}], event, at }` (401 clave incorrecta). `evolved` = las medusas que evolucionaron en la fecha vigente, en orden de llegada (de cualquier fecha de nacimiento, sin nombres). Sin emails/teléfonos; la clave va hasheada (sha256) en `lambdas/tickets/index.js`. La usa `/listas/` (puerta + evoluciones en vivo).
- `POST /tickets/invite/check` (public) `{ code }` → `{ ok, event }` (404 unknown/cancelled, 409 already used, 410 event already over)
- `POST /tickets/invite/claim` (public) `{ code, buyerName, buyerPhone?, buyerEmail? }` (name + phone or email) → `{ ticket:{ id, buyerName, status:'guest' }, event }` (409 if already used, 410 event already over). Front: `/invitacion/?c=CODE`.

Staff:
- `GET  /staff/members`        → `[{id,name,role,panels}]` (static config)
- `GET  /staff/tasks`          → `{ panels: { [panelId]: tasks[] } }` (global)
- `POST /staff/tasks/toggle`   `{ panelId, taskId, staffToken }` → `{ task }`
- `POST /staff/tasks/add`      `{ panelId, label, priority, staffToken }` → `{ task }`
- `GET  /staff/overview`       → `{ panels:[{id,pct,...}], totalPct }`

Newsletter:
- `POST /newsletter/subscribe` `{ email }` → `{ ok:true }`

Calendar:
- `GET  /calendar/events`      → `[events]`
- `POST /calendar/subscribe`   `{ email?, eventId }` → `{ icsUrl, googleUrl, event }`
- `GET  /calendar/ics/:id`     → ICS file

Cuenta (Google, opcional — `lambdas/account/index.js`):
- Sin sesiones: cada pedido trae el ID token de Google Identity Services (`credential`, el
  del botón «Continuar con Google») y `lambdas/lib/google.js` lo verifica (RS256 contra las
  claves públicas de Google, `iss`, `aud` = `GOOGLE_CLIENT_ID`, `exp`). Solo se usa el `sub`.
- `POST /account/save`    (public) `{ credential, claim }` → `{ medusas:[{ ticket, event }] }` (la frase queda primera; `ticket` como en `/tickets/redeem`). 404 palabra desconocida o anulada.
- `POST /account/medusas` (public) `{ credential }` → `{ medusas:[{ ticket, event }] }` (`[]` si la cuenta no guardó ninguna).
- Ambos: 401 token que no sirve, 503 sin `GOOGLE_CLIENT_ID`. Las guardadas cuya frase
  cambió (reword) o se anuló dejan de aparecer (se compara `claimNorm`).

Auth (legacy MetaCall, sin ruta en `aws-handler.js`; el sitio no lo usa):
- `POST /auth/exchange` `{ code, provider, redirect_uri }` → session/user (store in `hm_sessions`)
- `GET  /auth/me` (Bearer) → user

**Removed:** all `/mercadopago/*` endpoints + `lambdas/mercadopago/` (delete).

## Staff members (static config, code-level)

```
guido: 'Guido' · 'Arte · Visuales'        · [arte, finanzas, asistencia]
jose:  'Jose'  · 'Síntesis · Sistemas'    · [arte, finanzas, asistencia, sistemas]
juan:  'Juan'  · 'En vivo · Operaciones'  · [entradas_fisicas, arte]
meli:  'Meli'  · 'Colaboradora'           · [arte, costura, redes]
```

Default panel/task seed = the set already in `public/js/staff-panel.js`
(`STAFF_PANELS`). On first read, seed `hm_tasks` from it.

## Frontend (single file: `public/index.html`)

- Buy: modal collects name/email/phone (+ merch idea for VIP) → "Pedir por
  WhatsApp" opens `https://wa.me/<WHATSAPP_NUMBER>?text=<prefilled>` AND
  best-effort `POST /tickets/request`. No payment UI.
- Retrieve: "Reclamar tu palabra" → input phrase → `POST /tickets/redeem` → render
  a **ticket card showing the palabras clave** and the jellyfish at its level (NO QR).
  Works without login. No physical sticker for the current free date.
- Evolve: `/?evo=CODE` keeps the code in `sessionStorage` (`hm_evo`) and opens the same
  modal in "Evolucionar" mode → `POST /tickets/evolve` → the card animates from the
  previous level to the new one.
- Staff portal (`public/js/staff-panel.js`): call `/staff/*` (fallback to
  localStorage). Add an **Entradas** management view: list pending requests +
  freed tickets, "Liberar" button → `/tickets/:id/free`, show/copy claim phrase.
- Newsletter: `POST /newsletter/subscribe` (fallback toast).
- Calendar: "Agregar a calendario" → googleUrl + ICS (via `/calendar/*` or
  client-built ICS fallback).
- Tu medusa en el inicio: la última que se abrió en este navegador (`localStorage`
  `hm_claimed`: claim, nivel, rasgos, `saved`) se dibuja en una tarjeta del hero; tocarla
  abre «Tu hidromedusa».
- Cuenta: con `GOOGLE_CLIENT_ID`, el modal ofrece «Continuar con Google» para guardarla
  (`/account/save`) o traerlas en otro navegador (`/account/medusas`, chips si hay varias).
  El script de Google se carga recién al abrir el modal. Desde el navegador de una app
  (Instagram, etc.) Google no deja entrar: Android abre Chrome (`intent://`), iOS deja la
  URL lista (`?claim=…&guardar=1` / `?cuenta=1`) y explica cómo pasar a Safari.
- Legal: `/#privacidad` y `/#terminos` abren esos modales al entrar (Google los linkea en
  su pantalla de permisos).
- **Remove** the membership section, its nav links, and `join()` logic.
- Consolidate: after porting, delete `client/`, `public/js/{app,auth,tickets,
  staff,animations}.js`, `public/index.legacy.html`. Keep `public/js/staff-panel.js`
  (reworked) and `public/auth/callback.html`
  (point it at a minimal inline/standalone auth handler, not the deleted files).
