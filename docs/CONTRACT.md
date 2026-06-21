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
  phrase on the site to pull up their **ticket card** — the palabras clave shown
  as the door pass (NO QR; physical entrada-sticker handed over at the door).
- **Membership is hidden** for this pass (no MP, no billing).
- **OAuth login stays optional** and env-gated (demo fallback when no creds).

## Event (current, hardcoded fallback)

```
id: ev-1
title: Hidromedusa · 990 Espacio Cultural
date: 2026-07-11  time: 23:00 (-03:00)  +18
venue: 990 Espacio Cultural, Tandil, Buenos Aires, AR
tickets: general $10.000 ARS · vip $20.000 ARS (vip includes secret merch)
```

## Config (env + window)

Frontend reads a single global set near the top of `index.html`:

```js
window.HM_CONFIG = {
  API_BASE:        '',                 // '' => demo/offline fallback mode
  WHATSAPP_NUMBER: '549XXXXXXXXXX',    // E.164 no '+', placeholder — user fills
  GOOGLE_CLIENT_ID:    '',             // '' => demo auth
  APPLE_CLIENT_ID:     '',
  INSTAGRAM_CLIENT_ID: '',
};
```

Rule: **every real call degrades gracefully.** If `API_BASE` is empty or a
request fails, fall back to the existing local/demo behaviour (localStorage,
toast) so the static site keeps working with zero backend.

Backend env (`.env.example`): `APP_URL`, `API_URL`, `AWS_REGION`,
`DYNAMODB_ENDPOINT` (e.g. `http://localhost:4566` for LocalStack; unset => real
AWS), `DDB_TABLE_PREFIX` (default `hm_`), `STAFF_TOKEN` (shared staff passphrase;
unset => allow all in dev), `WHATSAPP_NUMBER`, OAuth + Google Calendar vars
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
| `hm_sessions`  | `token` (S)   | —                           | OAuth sessions (TTL `expiresAt`) |

`store.js` exports a small typed API (implement at least these):

```
tickets.put(t) / tickets.get(id) / tickets.byClaim(norm) / tickets.list({status?}) / tickets.update(id, patch)
tasks.getAll() / tasks.getPanel(panelId) / tasks.putPanel(panelId, tasks)
newsletter.add(email) / newsletter.list()
sessions.put(s) / sessions.get(token) / sessions.del(token)
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
```

```js
{
  id, type, eventId,
  buyerName, buyerEmail|null, buyerPhone|null, merchIdea|null,
  claim|null, claimNorm|null, qrData|null,        // set on free
  status, issuedBy|null,
  createdAt, freedAt|null, usedAt|null
}
```

`qrData` = base64 of `JSON.stringify({ id, claim, type, eventId })`.

## HTTP API (MetaCall endpoints — keep `metacall.json` in sync)

Staff-gated routes require `staffToken` (body) matching `STAFF_TOKEN`
(unset => allow). Public routes need nothing.

Tickets:
- `POST /tickets/request`  (public) `{ type, buyerName, buyerEmail?, buyerPhone?, merchIdea? }` → `{ ticket }` (status `pending`). Used to log a WhatsApp lead. Best-effort.
- `GET  /tickets`          (staff)  `?status=` → `[tickets]`
- `POST /tickets/:id/free` (staff)  `{ staffToken }` → `{ ticket }` (mints claim, sets `freed`)
- `POST /tickets/issue`    (staff)  `{ type, buyerName, ..., staffToken }` → `{ ticket }` (create + free in one step)
- `POST /tickets/redeem`   (public) `{ claim }` → `{ ticket, event }` (lookup by claimNorm; 404 if none)
- `POST /tickets/:id/scan` (staff)  `{ staffToken }` → `{ valid, ticket, reason? }`
- `GET  /tickets/:id`      (staff)  → `{ ticket }`

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

Auth (optional, keep):
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
  a **ticket card showing the palabras clave** as the door pass (NO QR). Works
  without login. The physical entrada-sticker is handed over at the door when the
  buyer says their palabras clave.
- Staff portal (`public/js/staff-panel.js`): call `/staff/*` (fallback to
  localStorage). Add an **Entradas** management view: list pending requests +
  freed tickets, "Liberar" button → `/tickets/:id/free`, show/copy claim phrase.
- Newsletter: `POST /newsletter/subscribe` (fallback toast).
- Calendar: "Agregar a calendario" → googleUrl + ICS (via `/calendar/*` or
  client-built ICS fallback).
- Auth: real OAuth popup when `GOOGLE_CLIENT_ID` etc. set, else demo login.
- **Remove** the membership section, its nav links, and `join()` logic.
- Consolidate: after porting, delete `client/`, `public/js/{app,auth,tickets,
  staff,animations}.js`, `public/index.legacy.html`. Keep `public/js/staff-panel.js`
  (reworked) and `public/auth/callback.html`
  (point it at a minimal inline/standalone auth handler, not the deleted files).
