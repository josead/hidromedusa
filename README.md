# HIDROMEDUSA 🪼

> Música en vivo desde las profundidades del universo oceánico-intergaláctico. Tandil, AR.

## Stack

- **Frontend**: HTML + Pure JavaScript + AnimeJS (single self-contained SPA, no build step)
- **Backend**: MetaCall Serverless Lambdas (Node.js)
- **Persistencia**: DynamoDB (LocalStack en dev, AWS en prod) vía AWS SDK v3
- **Entradas**: pedido por **WhatsApp/Instagram** → liberadas por **staff** → **palabras clave** (dos palabras en español) → entrada-sticker en la puerta (sin QR)
- **Auth** (opcional): OAuth — Google / Apple / Instagram
- **Calendar**: Google Calendar API + ICS

> Sin Mercado Pago: el pago se coordina por WhatsApp y el staff libera la entrada
> desde el panel. El comprador no necesita registrarse.

## Estructura

```
hidromedusa/
├── public/
│   ├── index.html              ← SPA principal (HTML + CSS + JS inline)
│   ├── js/
│   │   └── staff-panel.js      ← Panel staff (tasks + gestión de entradas)
│   └── auth/callback.html      ← OAuth redirect handler (self-contained)
├── lambdas/
│   ├── lib/
│   │   ├── store.js            ← Capa DynamoDB (endpoint configurable)
│   │   └── claimcode.js        ← Frases secretas (noun-adjective en español)
│   ├── auth/index.js           ← OAuth code exchange, sesiones (hm_sessions)
│   ├── tickets/index.js        ← request / free / issue / redeem / scan
│   ├── calendar/index.js       ← Eventos, ICS, Google Calendar
│   ├── staff/index.js          ← Tasks globales por panel, overview
│   ├── newsletter/index.js     ← Suscriptores
│   ├── package.json            ← Deps AWS SDK v3
│   └── metacall.json           ← Endpoints config para MetaCall FaaS
├── deploy/
│   ├── localstack/             ← docker-compose + create-tables.sh
│   └── ...                     ← scripts de infra AWS
├── docs/CONTRACT.md            ← Spec autoritativa (API + datos + config)
└── .env.example
```

## Setup local

```bash
# 1. Frontend (funciona standalone, en modo demo sin backend)
npm run dev                 # http://localhost:3000

# 2. Backend con DynamoDB local (LocalStack, requiere Docker)
npm run db:up               # levanta LocalStack
npm run db:init             # crea las tablas hm_*
cd lambdas && npm install   # instala AWS SDK v3
# correr/deployar los lambdas con MetaCall (ver abajo)
```

Copiá `.env.example` a `.env` y completá lo que necesites. **Todo degrada con
gracia**: si `API_BASE` está vacío o el backend no responde, el sitio sigue
andando en modo demo (WhatsApp abre igual, redeem muestra una tarjeta de ejemplo,
las tasks usan localStorage).

### Variables clave

| Var | Para qué |
|---|---|
| `DYNAMODB_ENDPOINT` | `http://localhost:4566` para LocalStack; vacío = AWS real |
| `STAFF_TOKEN` | Passphrase compartida del staff; sin setear = todo permitido en dev |
| `WHATSAPP_NUMBER` | Número E.164 sin `+` al que llegan los pedidos de entrada |
| `GOOGLE_/APPLE_/INSTAGRAM_*` | OAuth opcional (sin esto, login es demo) |
| `GOOGLE_CALENDAR_*` | Sync de Google Calendar (sin esto, eventos hardcodeados) |

En el frontend, esos valores se setean en `window.HM_CONFIG` arriba del script
inline de `index.html` (`API_BASE`, `WHATSAPP_NUMBER`, client IDs de OAuth).

## Deploy backend (MetaCall FaaS)

```bash
cd lambdas
metacall deploy --config metacall.json
```

Configurá las tablas DynamoDB en AWS (mismos nombres que `create-tables.sh`:
`hm_tickets` con GSI `claimNorm-index`, `hm_tasks`, `hm_newsletter`,
`hm_sessions`) y las variables de entorno reales.

## Flujo de entradas

1. El visitante toca **Pedir mi entrada** → se abre **WhatsApp o Instagram** con
   un mensaje prellenado (nombre, evento). Best-effort: se registra el pedido como
   ticket `pending` en el backend.
2. El **staff**, desde el panel (overlay → **Entradas**), ve los pedidos y toca
   **Liberar**: se generan las **palabras clave** (`medusa-violeta`) y la entrada
   pasa a `freed`. El staff se las manda al comprador por WhatsApp/Instagram.
3. El comprador entra a **"Reclamar tu palabra"**, escribe sus palabras clave y
   confirma su lugar — sin cuenta ni registro.
4. En la puerta dice sus **palabras clave** (no un número) y el staff le entrega
   su **entrada-sticker**. Las primeras 10 vienen con merch secreto; si tu palabra
   coincide con la de otra persona, ganan una consumición. 🍹

## Funcionalidades

### 🎫 Entradas
- Entrada única: $10.000 ARS (entrada-sticker que se entrega en la puerta)
- Pedido por WhatsApp o Instagram + liberación por staff + palabras clave
- Identificación por **palabras clave** (no por número ni QR)
- Primeras 10 con merch secreto · palabras coincidentes = consumición (icebreaker)

### 🔐 Auth (opcional)
- Google / Apple / Instagram OAuth (env-gated; modo demo sin credenciales)
- Nunca es obligatorio para comprar o reclamar una entrada

### 📅 Google Calendar
- "Agregar a calendario": link a Google Calendar + descarga ICS con recordatorios

### 👥 Staff Panel
Paneles compartidos (tasks globales por panel) + gestión de Entradas:

| Integrante | Paneles |
|---|---|
| **Guido** | Arte, Finanzas, Asistencia |
| **Jose** | Arte, Finanzas, Asistencia, Sistemas |
| **Juan** | Entradas físicas, Arte |
| **Meli** | Arte, Costura, Redes |

### 🔔 Notificaciones
- Push del navegador (Notification API) + recordatorio antes de la tocada

## Producción (hidromedusa.com)

1. Subir `public/` a S3 + CloudFront.
2. Setear `window.HM_CONFIG.API_BASE` y `WHATSAPP_NUMBER` en `index.html`.
3. Deployar los lambdas en MetaCall y crear las tablas DynamoDB.
4. Completar `.env` con credenciales reales (OAuth / Google Calendar / `STAFF_TOKEN`).

## Membresías

Ocultas por ahora (sin billing). El sistema de rangos Flasheros queda para una
fase futura.
