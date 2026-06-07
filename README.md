# 🌙 Night Bot

Bot de Discord completo para comunidades — moderación, economía, niveles, música, minijuegos, tickets y sistema Premium integrado con PayPal.

## ⚡ Instalación rápida

```bash
# 1. Clonar el proyecto
git clone <tu-repo>
cd night-bot

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Edita .env con tus credenciales

# 4. Registrar los slash commands en Discord
npm run deploy-commands

# 5. Iniciar el bot
npm start
```

## 🔧 Requisitos

- Node.js 18+
- MongoDB (local o Atlas)
- Redis (opcional, mejora rendimiento del XP)
- Cuenta de desarrollador en Discord
- Cuenta de PayPal Business (para pagos)

## 📋 Configuración (.env)

| Variable | Descripción |
|---|---|
| `DISCORD_TOKEN` | Token del bot (discord.com/developers) |
| `CLIENT_ID` | Application ID del bot |
| `MONGODB_URI` | URI de conexión a MongoDB |
| `REDIS_URL` | URI de Redis (opcional) |
| `PAYPAL_CLIENT_ID` | Client ID de PayPal Developer |
| `PAYPAL_CLIENT_SECRET` | Secret de PayPal |
| `PAYPAL_MODE` | `sandbox` (pruebas) o `live` (producción) |
| `DASHBOARD_URL` | URL pública de tu servidor (ngrok en dev) |

## 🌙 Módulos

| Módulo | Comandos |
|---|---|
| Moderación | `/ban` `/kick` `/warn` `/mute` `/clear` |
| Economía | `/balance` `/daily` `/work` `/pay` |
| Niveles | `/rank` `/leaderboard` |
| Música | `/play` `/skip` `/queue` `/stop` |
| Tickets | `/ticket create\|close\|panel` |
| Premium | `/premium info\|buy\|status` |
| Utilidades | `/help` `/ping` `/userinfo` |

## ⭐ Sistema Premium

El premium cuesta **$1/mes** y se paga con PayPal.

Flujo de pago:
1. Usuario usa `/premium buy`
2. Bot genera link de PayPal
3. Usuario paga en PayPal
4. PayPal redirige a `DASHBOARD_URL/premium/success`
5. El servidor activa el premium automáticamente y notifica al usuario por DM

Para pruebas usa `PAYPAL_MODE=sandbox` y cuentas sandbox de [developer.paypal.com](https://developer.paypal.com).

## 📁 Estructura

```
night-bot/
├── src/
│   ├── index.js              # Entrada principal
│   ├── deploy-commands.js    # Registrar slash commands
│   ├── commands/
│   │   ├── moderation/       # ban, kick, warn, mute, clear
│   │   ├── economy/          # balance, daily, work, pay
│   │   ├── levels/           # rank, leaderboard
│   │   ├── music/            # play, skip, queue, stop
│   │   ├── tickets/          # ticket
│   │   ├── premium/          # premium
│   │   └── utils/            # help, ping, userinfo
│   ├── events/               # ready, interactionCreate, messageCreate...
│   ├── handlers/             # CommandHandler, EventHandler
│   ├── systems/              # PremiumWebhook
│   └── database/
│       ├── connection.js     # MongoDB
│       ├── redis.js          # Redis
│       └── models.js         # Esquemas: User, Guild, Ticket, Warn, PremiumOrder
├── .env.example
├── package.json
└── README.md
```

## 🚀 Despliegue en producción

Recomendado: **Railway**, **Render**, o **VPS con PM2**

```bash
# Con PM2
npm install -g pm2
pm2 start src/index.js --name "night-bot"
pm2 save
pm2 startup
```
