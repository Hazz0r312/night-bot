const express = require('express');
const { Client, Environment, OrdersController } = require('@paypal/paypal-server-sdk');
const { PremiumOrder, User, Guild } = require('../database/models');

// Configurar el nuevo SDK de PayPal
function getPaypalClient() {
  return new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId:     process.env.PAYPAL_CLIENT_ID,
      oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET,
    },
    environment: process.env.PAYPAL_MODE === 'live'
      ? Environment.Production
      : Environment.Sandbox,
  });
}

class PremiumWebhook {
  static start(client) {
    const app = express();
    app.use(express.json());

    // ─── Crear orden de pago (el bot llama a esto internamente) ───────────────
    app.post('/premium/create-order', async (req, res) => {
      const { discordId, guildId, type } = req.body;
      try {
        const paypalClient = getPaypalClient();
        const ordersController = new OrdersController(paypalClient);

        const { result } = await ordersController.ordersCreate({
          body: {
            intent: 'CAPTURE',
            purchaseUnits: [{
              amount: { currencyCode: 'USD', value: '1.00' },
              description: `Night Bot Premium (${type === 'user' ? 'Usuario' : 'Servidor'}) — 1 mes`,
            }],
            applicationContext: {
              returnUrl: `${process.env.DASHBOARD_URL}/premium/success?discordId=${discordId}&guildId=${guildId || ''}&type=${type}`,
              cancelUrl: `${process.env.DASHBOARD_URL}/premium/cancel`,
              brandName: 'Night Bot',
              userAction: 'PAY_NOW',
            },
          },
        });

        const approveLink = result.links.find(l => l.rel === 'approve')?.href;

        await PremiumOrder.create({
          orderId:   result.id,
          discordId,
          guildId:   guildId || null,
          type,
          amount:    1.00,
          status:    'pending',
        });

        res.json({ orderId: result.id, approveUrl: approveLink });
      } catch (err) {
        console.error('PayPal create order error:', err);
        res.status(500).json({ error: 'Error al crear la orden' });
      }
    });

    // ─── Éxito — PayPal redirige aquí tras aprobar el pago ────────────────────
    app.get('/premium/success', async (req, res) => {
      const { token, discordId, guildId, type } = req.query;
      if (!token) return res.redirect('/premium/cancel');

      try {
        const paypalClient = getPaypalClient();
        const ordersController = new OrdersController(paypalClient);
        const { result } = await ordersController.ordersCapture({ id: token, body: {} });

        if (result.status !== 'COMPLETED') return res.redirect('/premium/error');

        const expires = new Date();
        expires.setDate(expires.getDate() + 30);

        if (type === 'user') {
          await User.findOneAndUpdate(
            { userId: discordId, guildId: guildId || 'global' },
            { premium: true, premiumExpires: expires, premiumOrderId: token },
            { upsert: true }
          );
        } else {
          await Guild.findOneAndUpdate(
            { guildId },
            { premium: true, premiumExpires: expires, premiumOrderId: token },
            { upsert: true }
          );
        }

        await PremiumOrder.updateOne({ orderId: token }, { status: 'completed' });

        // Notificar al usuario por DM
        const discordUser = await client.users.fetch(discordId).catch(() => null);
        if (discordUser) {
          const { EmbedBuilder } = require('discord.js');
          discordUser.send({ embeds: [new EmbedBuilder()
            .setColor('#faa61a')
            .setTitle('⭐ ¡Premium activado!')
            .setDescription(
              `Tu premium de Night Bot ha sido activado.\n\n` +
              `**Tipo:** ${type === 'user' ? '👤 Usuario' : '🖥️ Servidor'}\n` +
              `**Válido hasta:** <t:${Math.floor(expires.getTime() / 1000)}:D>\n\n` +
              `¡Gracias por apoyar Night Bot! 🌙`
            )
            .setTimestamp()]
          }).catch(() => {});
        }

        res.redirect('/premium/thank-you');
      } catch (err) {
        console.error('PayPal capture error:', err);
        res.redirect('/premium/error');
      }
    });

    app.get('/premium/cancel',    (_, res) => res.send('<h2 style="font-family:sans-serif;padding:40px">Pago cancelado. Puedes cerrar esta ventana.</h2>'));
    app.get('/premium/error',     (_, res) => res.send('<h2 style="font-family:sans-serif;padding:40px">Error al procesar el pago. Contacta con soporte.</h2>'));
    app.get('/premium/thank-you', (_, res) => res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>¡Premium activado! — Night Bot</title>
      <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;background:#06060e;color:#fff;margin:0}
      .card{text-align:center;padding:48px;border:1px solid #f5c842;border-radius:20px}h1{color:#f5c842}p{color:#aaa}</style></head>
      <body><div class="card"><h1>⭐ ¡Premium activado!</h1><p>Revisa tus mensajes directos en Discord.</p>
      <p style="font-size:12px;margin-top:24px;opacity:.5">Puedes cerrar esta ventana</p></div></body></html>`));

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`✅ Webhook server en puerto ${PORT}`));
  }
}

module.exports = PremiumWebhook;