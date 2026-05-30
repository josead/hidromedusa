# HIDROMEDUSA 🪼

> Fiestas en las profundidades del universo oceánico-intergaláctico.

## Stack

- **Frontend**: HTML + Pure JavaScript + Tailwind CSS (CDN) + AnimeJS
- **Backend**: MetaCall Serverless Lambdas (Node.js)
- **Pagos**: Mercado Pago (QR + preferencias de pago)
- **Auth**: OAuth — Google / Apple / Instagram
- **Calendar**: Google Calendar API + ICS

## Estructura

```
hidromedusa/
├── public/
│   ├── index.html          ← SPA principal (todas las páginas)
│   └── auth/callback.html  ← OAuth redirect handler
├── client/
│   ├── css/input.css       ← Tailwind input (si usás build)
│   └── js/
│       ├── app.js          ← Router, estado, eventos, contenido legal
│       ├── tickets.js      ← Entradas, membresías, Mercado Pago
│       ├── auth.js         ← OAuth flow (Google/Apple/Instagram)
│       ├── staff.js        ← Panel de control staff
│       └── animations.js   ← AnimeJS animations
└── lambdas/
    ├── auth/index.js         ← OAuth code exchange, sesiones
    ├── mercadopago/index.js  ← Preferencias, webhooks, status
    ├── tickets/index.js      ← Emisión, validación, QR scan
    ├── calendar/index.js     ← Eventos, ICS, Google Calendar
    ├── staff/index.js        ← Tasks, overview, miembros
    └── metacall.json         ← Endpoints config para MetaCall FaaS
```

## Setup local

```bash
# Servir el frontend
cd public && npx serve . -p 3000
# Abrí http://localhost:3000

# O directamente:
open public/index.html
```

## Deploy backend (MetaCall FaaS)

```bash
cd lambdas
# Subir al FaaS de MetaCall
metacall deploy --config metacall.json
```

Configurá las variables de entorno desde `.env.example`.

## Funcionalidades

### 🎫 Entradas
- 3 tipos: General, Flashero, Abismal
- Pago via Mercado Pago (checkout + QR)
- QR único por entrada, scannable por staff
- Webhook MP para confirmar pagos

### 🪼 Membresías Flasheras
- 4 rangos: Plancton → Medusa → Kraken → Abismal
- Suscripción mensual via MP
- Beneficios incrementales

### 🔐 Auth
- Google OAuth 2.0
- Apple Sign In
- Instagram Basic Display API
- Modo demo (sin credenciales) para desarrollo local

### 📅 Google Calendar
- Sync de fechas de tocadas
- Descarga ICS con recordatorios automáticos
- Link directo a Google Calendar

### 👥 Staff Panel
Paneles personalizados por integrante:

| Integrante | Paneles |
|---|---|
| **Guido** | Arte, Finanzas, Asistencia |
| **Jose** | Arte, Finanzas, Asistencia, Sistemas |
| **Juan** | Entradas físicas, Arte |
| **Meli** | Arte, Costura, Redes |

Task management con progreso compartido, persistencia en localStorage.

### 🔔 Notificaciones
- Push notifications browser (Notification API)
- Recordatorios automáticos 24h antes de cada tocada
- Opt-in post-login

## Producción (hidromedusa.com)

1. Subir `public/` a S3 + CloudFront (ya tenés el dominio en AWS)
2. Configurar `API_URL` en `client/js/tickets.js` → apuntando al MetaCall FaaS
3. Completar `.env` con credenciales reales de MP, Google, Apple, Instagram
4. Configurar webhook URL en panel de MP: `https://api.hidromedusa.com/mercadopago/webhook`
