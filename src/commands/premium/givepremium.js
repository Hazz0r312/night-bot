/**
 * NIGHT BOT — /givepremium
 * Comando solo para el dueño del bot para dar premium manualmente.
 * 
 * Coloca este archivo en: src/commands/premium/givepremium.js
 */
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { User, Guild } = require('../../database/models');
const { COLORS, successEmbed, errorEmbed } = require('../../utils/helpers');

// ⚠️ Pon aquí TU Discord ID para que solo tú puedas usar este comando
const OWNER_IDS = ['1067020060452999178'];

module.exports = {
  cooldown: 3,
  data: new SlashCommandBuilder()
    .setName('givepremium')
    .setDescription('🔧 [OWNER] Dar premium manualmente')
    .addSubcommand(s => s.setName('usuario').setDescription('Dar premium a un usuario')
      .addUserOption(o => o.setName('target').setDescription('Usuario').setRequired(true))
      .addIntegerOption(o => o.setName('dias').setDescription('Días de premium').setMinValue(1).setMaxValue(365).setRequired(false)))
    .addSubcommand(s => s.setName('servidor').setDescription('Dar premium a este servidor')
      .addIntegerOption(o => o.setName('dias').setDescription('Días de premium').setMinValue(1).setMaxValue(365).setRequired(false)))
    .addSubcommand(s => s.setName('quitar').setDescription('Quitar premium a un usuario')
      .addUserOption(o => o.setName('target').setDescription('Usuario').setRequired(true))),

  async execute(interaction) {
    // Solo el dueño puede usar este comando
    if (!OWNER_IDS.includes(interaction.user.id) && OWNER_IDS[0] !== 'TU_DISCORD_ID_AQUI') {
      return interaction.reply({ embeds: [errorEmbed('Solo el dueño del bot puede usar este comando.')], flags: MessageFlags.Ephemeral });
    }

    // Si no has configurado tu ID, avisar
    if (OWNER_IDS[0] === 'TU_DISCORD_ID_AQUI') {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.warn)
          .setTitle('⚠️ Configura tu Owner ID')
          .setDescription('Edita el archivo `givepremium.js` y reemplaza `TU_DISCORD_ID_AQUI` con tu Discord ID real.\n\n**¿Cómo ver tu ID?**\nActiva Modo Desarrollador en Discord → clic derecho en tu nombre → Copiar ID')
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub  = interaction.options.getSubcommand();
    const dias = interaction.options.getInteger('dias') || 30;

    const expires = new Date();
    expires.setDate(expires.getDate() + dias);

    // ── DAR PREMIUM A USUARIO ──────────────────────────────────────────────────
    if (sub === 'usuario') {
      const target = interaction.options.getUser('target');

      // Actualizar en TODOS los registros de ese usuario (todos los servidores)
      await User.updateMany(
        { userId: target.id },
        { $set: { premium: true, premiumExpires: expires } }
      );

      // Si no tiene ningún registro, crear uno global
      const existing = await User.findOne({ userId: target.id });
      if (!existing) {
        await User.create({
          userId:         target.id,
          guildId:        interaction.guildId,
          premium:        true,
          premiumExpires: expires,
        });
      }

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.gold)
          .setTitle('⭐ Premium activado')
          .setDescription(`Premium activado para **${target.username}**`)
          .addFields(
            { name: '👤 Usuario',   value: `${target.tag} (${target.id})`, inline: true },
            { name: '📅 Expira',    value: `<t:${Math.floor(expires.getTime() / 1000)}:D>`, inline: true },
            { name: '⏱️ Duración',  value: `${dias} días`, inline: true },
          )
          .setTimestamp()
        ],
      });

      // Notificar al usuario por DM
      target.send({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.gold)
          .setTitle('⭐ ¡Premium activado!')
          .setDescription(
            `El dueño del bot te ha dado **Night Premium** por **${dias} días**.\n\n` +
            `**Válido hasta:** <t:${Math.floor(expires.getTime() / 1000)}:D>\n\n` +
            `Ya puedes usar todos los comandos premium: \`/ia ask\`, \`/volume\`, \`/filters\`, \`/autoplay\` y más. 🌙`
          )
          .setTimestamp()
        ],
      }).catch(() => {}); // Si tiene DMs cerrados, ignorar
    }

    // ── DAR PREMIUM AL SERVIDOR ────────────────────────────────────────────────
    else if (sub === 'servidor') {
      await Guild.findOneAndUpdate(
        { guildId: interaction.guildId },
        { $set: { premium: true, premiumExpires: expires } },
        { upsert: true }
      );

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.gold)
          .setTitle('⭐ Premium de servidor activado')
          .setDescription(`Premium activado para el servidor **${interaction.guild.name}**`)
          .addFields(
            { name: '🖥️ Servidor',  value: interaction.guild.name, inline: true },
            { name: '📅 Expira',    value: `<t:${Math.floor(expires.getTime() / 1000)}:D>`, inline: true },
            { name: '⏱️ Duración',  value: `${dias} días`, inline: true },
          )
          .setTimestamp()
        ],
      });
    }

    // ── QUITAR PREMIUM ─────────────────────────────────────────────────────────
    else if (sub === 'quitar') {
      const target = interaction.options.getUser('target');

      await User.updateMany(
        { userId: target.id },
        { $set: { premium: false, premiumExpires: null } }
      );

      await interaction.reply({
        embeds: [successEmbed(`Premium retirado a **${target.username}**.`)],
      });
    }
  },
};
