const express  = require('express');
const axios    = require('axios');
const path     = require('path');
const { Guild, User, PremiumOrder } = require('../database/models');

class WebServer {
  static start(client) {
    const app  = express();
    const PORT = process.env.PORT || 3000;

    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../../dashboard/public')));

    // ── Health check para Render ───────────────────────────────────────────────
    app.get('/', (req, res) => res.json({
      status: 'online',
      bot:    client.user?.tag || 'iniciando...',
      guilds: client.guilds.cache.size,
    }));

    app.get('/health', (req, res) => res.json({ ok: true }));

    // ── Obtener token de PayPal ────────────────────────────────────────────────
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

    // ── Checkout — redirige a PayPal ──────────────────────────────────────────
    app.get('/premium/checkout', async (req, res) => {
      const { discordId, guildId, type } = req.query;

      if (!discordId) {
        return res.status(400).send(errorPage('Falta el Discord ID.'));
      }

      // Si no hay credenciales de PayPal configuradas
      if (!process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID === 'TU_PAYPAL_CLIENT_ID') {
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
        }, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        });

        // Guardar orden pendiente
        try {
          await PremiumOrder.create({
            orderId:   order.data.id,
            discordId,
            guildId:   guildId || null,
            type:      type || 'user',
            amount:    1.00,
            status:    'pending',
          });
        } catch {}

        // Redirigir al link de aprobación de PayPal
        const approveUrl = order.data.links.find(l => l.rel === 'approve')?.href;
        if (!approveUrl) return res.status(500).send(errorPage('Error al crear la orden de PayPal.'));

        res.redirect(approveUrl);
      } catch (err) {
        console.error('PayPal checkout error:', err.message);
        res.status(500).send(errorPage(`Error de PayPal: ${err.message}`));
      }
    });

    // ── Success — PayPal redirige aquí tras el pago ────────────────────────────
    app.get('/premium/success', async (req, res) => {
      const { token, discordId, guildId, type } = req.query;
      if (!token) return res.redirect('/premium/cancel');

      try {
        const { token: accessToken, base } = await getPaypalToken();

        // Capturar el pago
        const capture = await axios.post(
          `${base}/v2/checkout/orders/${token}/capture`,
          {},
          { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
        );

        if (capture.data.status !== 'COMPLETED') {
          return res.redirect('/premium/cancel');
        }

        // Activar premium — 30 días
        const expires = new Date();
        expires.setDate(expires.getDate() + 30);

        if (type === 'server' && guildId) {
          await Guild.findOneAndUpdate(
            { guildId },
            { premium: true, premiumExpires: expires, premiumOrderId: token },
            { upsert: true }
          );
        } else {
          await User.findOneAndUpdate(
            { userId: discordId, guildId: guildId || 'global' },
            { premium: true, premiumExpires: expires, premiumOrderId: token },
            { upsert: true }
          );
        }

        await PremiumOrder.updateOne({ orderId: token }, { status: 'completed' }).catch(() => {});

        // Notificar por DM en Discord
        try {
          const user = await client.users.fetch(discordId);
          const { EmbedBuilder } = require('discord.js');
          await user.send({ embeds: [new EmbedBuilder()
            .setColor(0xF0C040)
            .setTitle('⭐ ¡Premium activado!')
            .setDescription(
              `Tu premium de Night Bot ha sido activado correctamente.\n\n` +
              `**Tipo:** ${type === 'server' ? '🖥️ Servidor' : '👤 Usuario'}\n` +
              `**Válido hasta:** <t:${Math.floor(expires.getTime() / 1000)}:D>\n\n` +
              `¡Gracias por apoyar Night Bot! 🌙`
            )
            .setTimestamp()
          ]});
        } catch {}

        res.send(successPage());
      } catch (err) {
        console.error('PayPal capture error:', err.message);
        res.redirect('/premium/cancel');
      }
    });

    // ── Cancel ────────────────────────────────────────────────────────────────
    app.get('/premium/cancel', (req, res) => res.send(cancelPage()));

    // ── Dashboard ─────────────────────────────────────────────────────────────
    app.get('*', (req, res) => {
      const indexPath = path.join(__dirname, '../../dashboard/public/index.html');
      if (require('fs').existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.json({ status: 'Night Bot API', version: '2.0.0' });
      }
    });

    app.listen(PORT, () => {
      console.log(`✅ Servidor web en puerto ${PORT}`);
    });
  }
}

// ── Páginas HTML ──────────────────────────────────────────────────────────────
function successPage() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>¡Premium activado! — Night Bot</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#06060f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{text-align:center;padding:48px 40px;border:1px solid rgba(240,192,64,.3);border-radius:20px;max-width:440px;background:#111125}
  h1{color:#f0c040;font-size:28px;margin:16px 0 12px}.sub{color:#9896b8;font-size:15px;line-height:1.7}
  .note{font-size:12px;color:#6b6890;margin-top:24px}</style></head>
  <body><div class="card"><div style="font-size:52px">⭐</div><h1>¡Premium activado!</h1>
  <p class="sub">Tu pago fue procesado correctamente.<br>Revisa tus mensajes directos en Discord.</p>
  <p class="note">Puedes cerrar esta ventana</p></div></body></html>`;
}

function cancelPage() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Pago cancelado — Night Bot</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#06060f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{text-align:center;padding:48px 40px;border:1px solid rgba(255,255,255,.1);border-radius:20px;max-width:440px;background:#111125}
  h1{color:#9896b8;font-size:24px;margin:16px 0 12px}.sub{color:#6b6890;font-size:14px}</style></head>
  <body><div class="card"><div style="font-size:48px">❌</div><h1>Pago cancelado</h1>
  <p class="sub">No se realizó ningún cargo. Puedes cerrar esta ventana.</p></div></body></html>`;
}

function errorPage(msg) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Error — Night Bot</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#06060f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{text-align:center;padding:48px 40px;border:1px solid rgba(242,92,110,.3);border-radius:20px;max-width:440px;background:#111125}
  h1{color:#f25c6e;font-size:24px;margin:16px 0 12px}.sub{color:#9896b8;font-size:14px}</style></head>
  <body><div class="card"><div style="font-size:48px">⚠️</div><h1>Error</h1>
  <p class="sub">${msg}</p></div></body></html>`;
}

function noPaypalPage() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>PayPal no configurado — Night Bot</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#06060f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{text-align:center;padding:48px 40px;border:1px solid rgba(240,192,64,.3);border-radius:20px;max-width:480px;background:#111125}
  h1{color:#f0c040;font-size:22px;margin:16px 0 12px}.sub{color:#9896b8;font-size:14px;line-height:1.7}
  code{background:#1c1c38;padding:3px 8px;border-radius:5px;font-size:13px;color:#a399fb}</style></head>
  <body><div class="card"><div style="font-size:48px">⚙️</div><h1>PayPal no configurado</h1>
  <p class="sub">El administrador del bot necesita configurar las credenciales de PayPal.<br><br>
  Añade <code>PAYPAL_CLIENT_ID</code> y <code>PAYPAL_CLIENT_SECRET</code> en las variables de entorno de Render.</p>
  </div></body></html>`;
}

module.exports = WebServer;
