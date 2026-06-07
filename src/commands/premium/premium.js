const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { errorEmbed, hasPremium, isPremiumUser, isPremiumGuild } = require('../../utils/helpers');
const { User, Guild, PremiumOrder } = require('../../database/models');
const axios = require('axios');

// ─── Crear orden PayPal (REST API v2) ─────────────────────────────────────────
async function createPayPalOrder(discordId, guildId, type) {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const base = process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.yahoo.com'; // O la URL de sandbox de paypal sandbox.paypal.com

  const tokenRes = await axios.post(`${base}/v1/oauth2/token`,
    'grant_type=client_credentials',
    { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  const token = tokenRes.data.access_token;

  const orderRes = await axios.post(`${base}/v2/checkout/orders`, {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: 'USD', value: '1.00' },
      description: `Night Bot Premium (${type === 'user' ? 'Usuario' : 'Servidor'}) — 1 mes`,
    }],
    application_context: {
      return_url: `${process.env.DASHBOARD_URL || 'http://localhost'}/premium/success?discordId=${discordId}&guildId=${guildId || ''}&type=${type}`,
      cancel_url: `${process.env.DASHBOARD_URL || 'http://localhost'}/premium/cancel`,
      brand_name: 'Night Bot',
      user_action: 'PAY_NOW',
    },
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

  const order      = orderRes.data;
  const approveUrl = order.links.find(l => l.rel === 'approve')?.href;
  return { orderId: order.id, approveUrl, token };
}

module.exports = {
  cooldown: 10,
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('⭐ Night Premium')
    .addSubcommand(s => s.setName('info').setDescription('Ver ventajas del Premium'))
    .addSubcommand(s => s.setName('status').setDescription('Ver tu estado Premium'))
    .addSubcommand(s => s.setName('buy').setDescription('Comprar Premium por $1/mes')
      .addStringOption(o => o.setName('tipo').setDescription('Tipo').setRequired(true)
        .addChoices({ name: '👤 Usuario — Solo tú', value: 'user' }, { name: '🖥️ Servidor — Todo el servidor', value: 'server' }))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    
    // Protección de deferReply obligatoria
    await interaction.deferReply({ ephemeral: true });

    // Colores fijos quemados en código para evitar fallos por desconfiguración externa
    const COLOR_GOLD  = 0xF1C40F;
    const COLOR_NIGHT = 0x2B2D31;

    // ── INFO ──────────────────────────────────────────────────────────────────
    if (sub === 'info') {
      return interaction.editReply({ embeds: [new EmbedBuilder()
        .setColor(COLOR_GOLD)
        .setTitle('⭐ Night Premium — $1/mes')
        .setDescription('Desbloquea todo el potencial de Night Bot por solo **$1 al mes**.')
        .addFields(
          { name: '🆓 Plan Gratuito', value: [
            '✅ Moderación completa',
            '✅ Economía básica (daily: 500 coins)',
            '✅ Sistema de niveles (15-40 XP)',
            '✅ Tickets (máx 5 activos)',
            '✅ Bienvenida simple',
            '✅ Música básica',
            '❌ IA',
          ].join('\n'), inline: true },
          { name: '⭐ Plan Premium', value: [
            '✅ Todo lo gratuito',
            '⭐ Daily x2 (1000 coins)',
            '⭐ Work x2 (salario doble)',
            '⭐ XP x2 (30-70 XP/msg)',
            '⭐ Tickets ilimitados',
            '⭐ IA con Google Gemini',
            '⭐ Anti-spam avanzado',
            '⭐ Personalidad IA custom',
            '⭐ Soporte prioritario',
          ].join('\n'), inline: true },
          { name: '💳 Precio', value: '**$1.00 / mes**\nPago seguro con PayPal' },
        )
        .setFooter({ text: 'Usa /premium buy para activarlo' })]
      });
    }

    // ── STATUS ────────────────────────────────────────────────────────────────
    else if (sub === 'status') {
      try {
        const currentGuildId = interaction.guildId || '0';
        
        // Ejecución segura de las funciones auxiliares
        const userP  = typeof isPremiumUser === 'function' ? await isPremiumUser(interaction.user.id, currentGuildId).catch(() => false) : false;
        const guildP = typeof isPremiumGuild === 'function' ? await isPremiumGuild(currentGuildId).catch(() => false) : false;
        
        let u = null;
        let g = null;

        if (User) u = await User.findOne({ userId: interaction.user.id, guildId: currentGuildId }).catch(() => null);
        if (Guild && interaction.guildId) g = await Guild.findOne({ guildId: currentGuildId }).catch(() => null);

        const userExpires = u && u.premiumExpires ? `<t:${Math.floor(u.premiumExpires / 1000)}:D>` : '❌ No activo';
        const guildExpires = g && g.premiumExpires ? `<t:${Math.floor(g.premiumExpires / 1000)}:D>` : '❌ No activo';

        return interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(userP || guildP ? COLOR_GOLD : COLOR_NIGHT)
          .setTitle('⭐ Estado Premium')
          .addFields(
            { name: '👤 Tu cuenta', value: userP ? `✅ Activo hasta ${userExpires}` : '❌ No activo', inline: true },
            { name: '🖥️ Este servidor', value: guildP ? `✅ Activo hasta ${guildExpires}` : '❌ No activo', inline: true },
          )
          .setFooter({ text: userP || guildP ? '¡Gracias por apoyar Night Bot! 🌙' : 'Actívalo con /premium buy' })]
        });
      } catch (err) {
        console.error('❌ Error interno ejecutando subcomando status:', err);
        return interaction.editReply({ content: '❌ Ocurrió un error al consultar tu estado premium en la base de datos.' });
      }
    }

    // ── BUY ───────────────────────────────────────────────────────────────────
    else if (sub === 'buy') {
      const tipo = interaction.options.getString('tipo');

      if (!process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID === 'TU_PAYPAL_CLIENT_ID') {
        return interaction.editReply({ content: '❌ PayPal no está configurado aún en este bot. Contacta al administrador.' });
      }

      try {
        const { orderId, approveUrl } = await createPayPalOrder(interaction.user.id, interaction.guildId, tipo);

        if (PremiumOrder) {
          await PremiumOrder.create({
            orderId,
            discordId: interaction.user.id,
            guildId:   interaction.guildId || '0',
            type:      tipo,
            amount:    1.00,
          }).catch(e => console.log('⚠️ No se pudo registrar la orden en DB, pero el link se generó:', e.message));
        }

        const embed = new EmbedBuilder()
          .setColor(COLOR_GOLD)
          .setTitle('⭐ Comprar Night Premium')
          .setDescription(
            `**Tipo:** ${tipo === 'user' ? '👤 Usuario' : '🖥️ Servidor'}\n` +
            `**Precio:** $1.00 / mes\n\n` +
            `Haz clic en el botón para ir a PayPal. Después del pago, tu premium se activará automáticamente.`
          )
          .setFooter({ text: 'Link válido 3 horas • Pago 100% seguro con PayPal' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel('Pagar $1 con PayPal').setStyle(ButtonStyle.Link).setURL(approveUrl).setEmoji('💳'),
        );

        return interaction.editReply({ embeds: [embed], components: [row] });
      } catch (err) {
        console.error('PayPal error:', err.message);
        return interaction.editReply({ content: `❌ Error al crear la orden de pago con PayPal: ${err.message}` });
      }
    }
  },
};