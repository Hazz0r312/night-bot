const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { Ticket } = require('../../database/models');
const { COLORS, errorEmbed, successEmbed, getGuild } = require('../../utils/helpers');

module.exports = {
  cooldown: 10,
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('🎫 Sistema de soporte')
    .addSubcommand(s => s.setName('panel').setDescription('Admin: Crear panel de tickets')
      .addChannelOption(o => o.setName('canal').setDescription('Canal donde poner el panel').setRequired(true)))
    .addSubcommand(s => s.setName('close').setDescription('Cerrar ticket actual'))
    .addSubcommand(s => s.setName('list').setDescription('Admin: Ver tickets abiertos')),

  async execute(interaction, client, config) {
    const sub = interaction.options.getSubcommand();

    // ── PANEL (admin) ──────────────────────────────────────────────────────────
    if (sub === 'panel') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ embeds: [errorEmbed('Solo administradores pueden crear el panel.')], ephemeral: true });

      const channel = interaction.options.getChannel('canal');

      const embed = new EmbedBuilder()
        .setColor(COLORS.main)
        .setTitle('🎫 Soporte — Abre un Ticket')
        .setDescription(
          '¿Necesitas ayuda? Haz clic en el botón de abajo para abrir un ticket.\n\n' +
          '📋 **Cómo funciona:**\n' +
          '• Se creará un canal privado solo para ti y el staff\n' +
          '• Describe tu problema y el equipo te responderá\n' +
          '• Cuando se resuelva, el ticket se cerrará automáticamente'
        )
        .setFooter({ text: `${interaction.guild.name} • Soporte` })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_panel_open')
          .setLabel('Abrir Ticket')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🎫'),
      );

      await channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ embeds: [successEmbed(`Panel de tickets creado en ${channel}.`)], ephemeral: true });
    }

    // ── CLOSE ──────────────────────────────────────────────────────────────────
    else if (sub === 'close') {
      const ticket = await Ticket.findOne({ channelId: interaction.channelId, status: 'open' });
      if (!ticket) return interaction.reply({ embeds: [errorEmbed('Este canal no es un ticket abierto.')], ephemeral: true });

      const canClose = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) || ticket.userId === interaction.user.id;
      if (!canClose) return interaction.reply({ embeds: [errorEmbed('No tienes permiso para cerrar este ticket.')], ephemeral: true });

      await Ticket.updateOne({ _id: ticket._id }, { status: 'closed' });
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription('🔒 Cerrando ticket en **5 segundos**...')] });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    // ── LIST ───────────────────────────────────────────────────────────────────
    else if (sub === 'list') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return interaction.reply({ embeds: [errorEmbed('Solo staff.')], ephemeral: true });

      const tickets = await Ticket.find({ guildId: interaction.guildId, status: 'open' });
      if (!tickets.length) return interaction.reply({ embeds: [successEmbed('No hay tickets abiertos.')], ephemeral: true });

      const list = tickets.map(t => `🎫 <#${t.channelId}> — <@${t.userId}> — ${t.topic}`).join('\n');
      interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.main)
        .setTitle(`🎫 Tickets abiertos (${tickets.length})`)
        .setDescription(list)
        .setTimestamp()]
      });
    }
  },
};