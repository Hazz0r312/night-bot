const express  = require('express');
const axios    = require('axios');
const path     = require('path');
const fs       = require('fs');
const { Guild, User, PremiumOrder } = require('../database/models');

// Rate limiter simple sin dependencias externas
const rateLimitMap = new Map();
function rateLimit(ip, max = 30, windowMs = 60000) {
  const now  = Date.now();
  const data = rateLimitMap.get(ip) || { count: 0, reset: now + windowMs };
  if (now > data.reset) { data.count = 0; data.reset = now + windowMs; }
  data.count++;
  rateLimitMap.set(ip, data);
  return data.count > max;
}

class WebServer {
  static start(client) {
    const app  = express();
    const PORT = process.env.PORT || 3000;

    app.use(express.json({ limit: '10kb' })); // Limitar payload
    app.use(express.static(path.join(__dirname, '../../dashboard/public')));

    // ── Headers de seguridad ───────────────────────────────────────────────────
    app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'no-referrer');
      next();
    });

    // ── Rate limiting global ───────────────────────────────────────────────────
    app.use((req, res, next) => {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      if (rateLimit(ip, 60, 60000)) {
        return res.status(429).json({ error: 'Demasiadas peticiones. Espera un momento.' });
      }
      next();
    });

    // ── Health ────────────────────────────────────────────────────────────────
    app.get('/', (req, res) => res.json({
      status: 'online',
      bot:    client.user?.tag || 'iniciando...',
      guilds: client.guilds.cache.size,
    }));
    app.get('/health', (req, res) => res.json({ ok: true }));

    // ── Login de Discord (OAuth2) ─────────────────────────────────────────────
    app.get('/api/auth/login', (req, res) => {
      const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1510720628020220015';
      const REDIRECT_URI = 'https://night-bot-j5at.onrender.com/api/auth/callback';
      const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
      res.redirect(discordUrl);
    });

    // ── RUTA AGREGADA: Callback de Discord (OAuth2) ───────────────────────────
    app.get('/api/auth/callback', async (req, res) => {
      const { code } = req.query;
      if (!code) return res.status(400).send(errorPage('No se proporcionó el código de autorización.'));

      try {
        const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1510720628020220015';
        const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'TU_CLIENT_SECRET_AQUÍ';
        const REDIRECT_URI = 'https://night-bot-j5at.onrender.com/api/auth/callback';

        // 1. Intercambiar el código que viste en tu imagen por el Token de acceso oficial
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
          new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
          }), 
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { access_token } = tokenResponse.data;

        // 2. Obtener los datos del usuario que acaba de autorizar (ID, avatar, etc.)
        const userResponse = await axios.get('https://discord.com/api/v10/users/@me', {
          headers: { Authorization: `Bearer ${access_token}` }
        });

        // 3. Redirigir de golpe a tu frontend de Netlify pasándole el token y su ID por la URL
        const dashboardUrl = process.env.DASHBOARD_URL || 'https://dashboard-night-bot.netlify.app';
        res.redirect(`${dashboardUrl}?token=${access_token}&discordId=${userResponse.data.id}`);

      } catch (err) {
        console.error('Error en el callback de Discord:', err.response?.data || err.message);
        res.status(500).send(errorPage('Error al conectar con Discord. Asegúrate de configurar el DISCORD_CLIENT_SECRET en Render.'));
      }
    });

    // ── PayPal token ──────────────────────────────────────────────────────────
    async function getPaypalToken() {
      const base = process.env.PAYPAL_MODE === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
      const auth = Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
      ).toString('base64');
      const res = await axios.post(
        `${base}/v1/oauth2/token`,
        'grant_type=client_credentials',
        { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return { token: res.data.access_token, base };
    }

    // ── Checkout ──────────────────────────────────────────────────────────────
    app.get('/premium/checkout', async (req, res) => {
      const { discordId, guildId, type } = req.query;

      // Validar Discord ID
      if (!discordId || !/^\d{17,20}$/.test(discordId)) {
        return res.status(400).send(errorPage('Discord ID inválido.'));
      }

      if (!process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID === 'AZj6VpCazr5cpdt90jHgzMi4xLhdm4xga39InPNcreraSmBdr0yTXkoex28zdM0VkNiP-ew40HXb9FTz') {
        return res.send(noPaypalPage());
      }

      try {
        const { token, base } = await getPaypalToken();
        const order = await axios.post(`${base}/v2/checkout/orders`, {
          intent: 'CAPTURE',
          purchase_units: [{
            amount: { currency_code: 'USD', value: '1.00' },
            description: `Night Bot Premium (${type === 'server' ? 'Servidor' : 'Usuario'}) — 1 mes`,
          }],
          application_context: {
            return_url:  `${process.env.DASHBOARD_URL}/premium/success?discordId=${discordId}&guildId=${guildId || ''}&type=${type || 'user'}`,
            cancel_url:  `${process.env.DASHBOARD_URL}/premium/cancel`,
            brand_name:  'Night Bot',
            user_action: 'PAY_NOW',
          },
        }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

        try {
          await PremiumOrder.create({
            orderId: order.data.id, discordId,
            guildId: guildId || null, type: type || 'user', amount: 1.00, status: 'pending',
          });
        } catch {}

        const approveUrl = order.data.links.find(l => l.rel === 'approve')?.href;
        if (!approveUrl) return res.status(500).send(errorPage('Error al crear la orden.'));
        res.redirect(approveUrl);
      } catch (err) {
        console.error('PayPal checkout error:', err.message);
        res.status(500).send(errorPage('Error de PayPal. Contacta con soporte.'));
      }
    });

    // ── Success ───────────────────────────────────────────────────────────────
    app.get('/premium/success', async (req, res) => {
      const { token, discordId, guildId, type } = req.query;
      if (!token || !discordId) return res.redirect('/premium/cancel');

      try {
        const { token: accessToken, base } = await getPaypalToken();
        const capture = await axios.post(
          `${base}/v2/checkout/orders/${token}/capture`, {},
          { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
        );
        if (capture.data.status !== 'COMPLETED') return res.redirect('/premium/cancel');

        const expires = new Date();
        expires.setDate(expires.getDate() + 30);

        if (type === 'server' && guildId && /^\d{17,20}$/.test(guildId)) {
          await Guild.findOneAndUpdate(
            { guildId },
            { premium: true, premiumExpires: expires, premiumOrderId: token },
            { upsert: true }
          );
        } else if (/^\d{17,20}$/.test(discordId)) {
          await User.findOneAndUpdate(
            { userId: discordId, guildId: guildId || 'global' },
            { premium: true, premiumExpires: expires, premiumOrderId: token },
            { upsert: true }
          );
        }

        await PremiumOrder.updateOne({ orderId: token }, { status: 'completed' }).catch(() => {});

        // DM al usuario
        try {
          const user = await client.users.fetch(discordId);
          const { EmbedBuilder } = require('discord.js');
          await user.send({ embeds: [new EmbedBuilder()
            .setColor(0xF0C040)
            .setTitle('⭐ ¡Premium activado!')
            .setDescription(
              `Tu premium ha sido activado correctamente.\n\n` +
              `**Tipo:** ${type === 'server' ? '🖥️ Servidor' : '👤 Usuario'}\n` +
              `**Válido hasta:** <t:${Math.floor(expires.getTime() / 1000)}:D>\n\n` +
              `¡Gracias por apoyar Night Bot! 🌙`
            ).setTimestamp()
          ]});
        } catch {}

        res.send(successPage());
      } catch (err) {
        console.error('PayPal capture error:', err.message);
        res.redirect('/premium/cancel');
      }
    });

    app.get('/premium/cancel', (req, res) => res.send(cancelPage()));

    // ── Dashboard ─────────────────────────────────────────────────────────────
    app.get('*', (req, res) => {
      const indexPath = path.join(__dirname, '../../dashboard/public/index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.json({ status: 'Night Bot API', version: '2.0.0' });
      }
    });

    app.listen(PORT, () => console.log(`✅ Servidor web en puerto ${PORT}`));
  }
}

function successPage() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Premium activado — Night Bot</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#06060f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{text-align:center;padding:48px 40px;border:1px solid rgba(240,192,64,.3);border-radius:20px;max-width:440px;background:#111125}
  h1{color:#f0c040;font-size:26px;margin:16px 0 10px}.sub{color:#9896b8;font-size:14px;line-height:1.7}.note{font-size:12px;color:#6b6890;margin-top:20px}</style></head>
  <body><div class="card"><div style="font-size:52px">⭐</div><h1>¡Premium activado!</h1>
  <p class="sub">Tu pago fue procesado correctamente.<br>Revisa tus mensajes directos en Discord.</p>
  <p class="note">Puedes cerrar esta ventana</p></div></body></html>`;
}
function cancelPage() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Cancelado — Night Bot</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#06060f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{text-align:center;padding:48px 40px;border:1px solid rgba(255,255,255,.08);border-radius:20px;max-width:440px;background:#111125}
  h1{color:#9896b8;font-size:22px;margin:16px 0 10px}.sub{color:#6b6890;font-size:14px}</style></head>
  <body><div class="card"><div style="font-size:48px">✖</div><h1>Pago cancelado</h1>
  <p class="sub">No se realizó ningún cargo.</p></div></body></html>`;
}
function errorPage(msg) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Error — Night Bot</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#06060f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{text-align:center;padding:48px 40px;border:1px solid rgba(242,92,110,.3);border-radius:20px;max-width:440px;background:#111125}
  h1{color:#f25c6e;font-size:22px;margin:16px 0 10px}.sub{color:#9896b8;font-size:14px}</style></head>
  <body><div class="card"><div style="font-size:48px">⚠</div><h1>Error</h1><p class="sub">${msg}</p></div></body></html>`;
}
function noPaypalPage() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Sin configurar — Night Bot</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#06060f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{text-align:center;padding:48px 40px;border:1px solid rgba(240,192,64,.3);border-radius:20px;max-width:480px;background:#111125}
  h1{color:#f0c040;font-size:20px;margin:16px 0 10px}.sub{color:#9896b8;font-size:14px;line-height:1.7}</style></head>
  <body><div class="card"><div style="font-size:48px">⚙</div><h1>PayPal no configurado</h1>
  <p class="sub">El administrador necesita configurar las credenciales de PayPal en Render.</p></div></body></html>`;
}

module.exports = WebServer;
