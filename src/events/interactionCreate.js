const {
  EmbedBuilder, Collection, PermissionFlagsBits, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { getGuild, errorEmbed } = require('../utils/helpers');
const { Ticket } = require('../database/models');

// Defaults para config — garantiza que NUNCA llegue undefined a los comandos
const DEFAULT_CONFIG = {
  currencyEmoji: '🪙', currencyName: 'coins', prefix: 'n!',
  levelsEnabled: true, antiLinks: false, antiInvites: false, antiSpam: false,
  welcomeEnabled: false, leaveEnabled: false, aiEnabled: false,
  bannedWords: [], levelRoles: [], ticketSupportRoles: [],
  welcomeMessage: '¡Bienvenido/a {user} a **{server}**! 🎉 Eres el miembro #**{count}**.',
  leaveMessage:   '**{username}** ha abandonado el servidor.',
  levelMessage:   '🎉 ¡{user} ha subido al nivel **{level}**!',
  ticketMessage:  '¡Hola {user}! El equipo te atenderá pronto.\n**Tema:** {topic}',
  aiPersonality:  'Eres Night, un bot de Discord amigable y útil.',
};

// Helper: respuesta efímera compatible con discord.js v14
const ephemeral = { flags: MessageFlags.Ephemeral };

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {

    // ─── SLASH COMMANDS ───────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      // Cooldown
      const { cooldowns } = client;
      if (!cooldowns.has(command.data.name)) cooldowns.set(command.data.name, new Collection());
      const stamps = cooldowns.get(command.data.name);
      const cdMs   = (command.cooldown ?? 3) * 1000;
      const now    = Date.now();
      if (stamps.has(interaction.user.id)) {
        const exp = stamps.get(interaction.user.id) + cdMs;
        if (now < exp) {
          const left = ((exp - now) / 1000).toFixed(1);
          return interaction.reply({
            embeds: [new EmbedBuilder().setColor(0x2B2D31).setDescription(`⏳ Espera **${left}s** antes de usar este comando de nuevo.`)],
            ...ephemeral,
          });
        }
      }
      stamps.set(interaction.user.id, now);
      setTimeout(() => stamps.delete(interaction.user.id), cdMs);

      // Config del servidor — con fallback para que NUNCA sea undefined
      let guildConfig = { ...DEFAULT_CONFIG };
      try {
        const dbConfig = await getGuild(interaction.guildId);
        if (dbConfig) {
          const raw = typeof dbConfig.toObject === 'function' ? dbConfig.toObject() : dbConfig;
          guildConfig = { ...DEFAULT_CONFIG, ...raw };
        }
      } catch (dbErr) {
        console.error('⚠️  DB config fallback activado:', dbErr.message);
      }

      // Ejecutar comando
      try {
        await command.execute(interaction, client, guildConfig);
      } catch (err) {
        console.error(`❌ Error en /${interaction.commandName}:`, err);
        const reply = { embeds: [errorEmbed('Hubo un error al ejecutar este comando.')], ...ephemeral };
        if (interaction.replied || interaction.deferred) interaction.followUp(reply).catch(() => {});
        else interaction.reply(reply).catch(() => {});
      }
      return;
    }

    // ─── BUTTONS ──────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
      const { customId, guild, member } = interaction;

      // ── TICKET: abrir panel ────────────────────────────────────────────────
      if (customId === 'ticket_panel_open') {
        const modal = new ModalBuilder()
          .setCustomId('ticket_modal')
          .setTitle('Abrir un Ticket')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('ticket_topic')
                .setLabel('¿En qué podemos ayudarte?')
                .setStyle(TextInputStyle.Paragraph)
                .setMinLength(5)
                .setMaxLength(300)
                .setPlaceholder('Describe tu problema o pregunta...')
                .setRequired(true)
            )
          );
        await interaction.showModal(modal);
        return;
      }

      // ── TICKET: cerrar ─────────────────────────────────────────────────────
      if (customId === 'ticket_close') {
        const ticket = await Ticket.findOne({ channelId: interaction.channelId, status: 'open' });
        if (!ticket) return interaction.reply({ content: '❌ Este no es un ticket abierto.', ...ephemeral });

        const canClose = member.permissions.has(PermissionFlagsBits.ManageChannels) || ticket.userId === interaction.user.id;
        if (!canClose) return interaction.reply({ content: '❌ No tienes permiso para cerrar este ticket.', ...ephemeral });

        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('🔒 Cerrando ticket en **5 segundos**...')] });
        await Ticket.updateOne({ _id: ticket._id }, { status: 'closed' });

        // Log en canal de moderación
        let gConfig = { ...DEFAULT_CONFIG };
        try {
          const db = await getGuild(guild.id);
          if (db) gConfig = { ...DEFAULT_CONFIG, ...(db.toObject?.() ?? db) };
        } catch {}

        if (gConfig.ticketLogChannel) {
          const logCh = guild.channels.cache.get(gConfig.ticketLogChannel);
          if (logCh) {
            logCh.send({ embeds: [new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('🎫 Ticket cerrado')
              .addFields(
                { name: 'Ticket',     value: `#${ticket.ticketNum} — ${ticket.topic}`, inline: true },
                { name: 'Creado por', value: `<@${ticket.userId}>`,                    inline: true },
                { name: 'Cerrado por',value: `<@${interaction.user.id}>`,              inline: true },
              )
              .setTimestamp()]
            }).catch(() => {});
          }
        }

        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        return;
      }

      // ── TICKET: reclamar ───────────────────────────────────────────────────
      if (customId === 'ticket_claim') {
        const ticket = await Ticket.findOne({ channelId: interaction.channelId });
        if (!ticket) return;
        if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return interaction.reply({ content: '❌ Solo el staff puede reclamar tickets.', ...ephemeral });
        }
        await Ticket.updateOne({ _id: ticket._id }, { claimedBy: interaction.user.id });
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Ticket reclamado por <@${interaction.user.id}>`)] });
        return;
      }
    }

    // ─── MODALS ───────────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'ticket_modal') {
        await createTicket(interaction, client);
      }
    }
  },
};

// ─── Crear ticket desde modal ─────────────────────────────────────────────────
async function createTicket(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const topic   = interaction.fields.getTextInputValue('ticket_topic');
  const guild   = interaction.guild;

  let gConfig = {
    currencyEmoji: '🪙', currencyName: 'coins',
    ticketSupportRoles: [], ticketCategory: null,
    ticketMessage: '¡Hola {user}! El equipo te atenderá pronto.\n**Tema:** {topic}',
    ticketLogChannel: null,
  };
  try {
    const db = await getGuild(guild.id);
    if (db) gConfig = { ...gConfig, ...(db.toObject?.() ?? db) };
  } catch {}

  const existing = await Ticket.findOne({ guildId: guild.id, userId: interaction.user.id, status: 'open' });
  if (existing) {
    return interaction.editReply({ content: `❌ Ya tienes un ticket abierto: <#${existing.channelId}>` });
  }

  const ticketNum = (await Ticket.countDocuments({ guildId: guild.id })) + 1;
  const name      = `ticket-${String(ticketNum).padStart(4, '0')}`;

  const overwrites = [
    { id: guild.id,            deny:  [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: client.user.id,      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
  for (const rId of (gConfig.ticketSupportRoles || [])) {
    overwrites.push({ id: rId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  const channel = await guild.channels.create({
    name,
    type:   ChannelType.GuildText,
    parent: gConfig.ticketCategory || null,
    permissionOverwrites: overwrites,
  });

  await Ticket.create({ guildId: guild.id, userId: interaction.user.id, channelId: channel.id, ticketNum, topic });

  const msg = (gConfig.ticketMessage || '¡Hola {user}!')
    .replace('{user}',  `<@${interaction.user.id}>`)
    .replace('{topic}', topic);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎫 Ticket #${ticketNum}`)
    .setDescription(msg)
    .addFields({ name: '📋 Tema', value: topic })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Reclamar').setStyle(ButtonStyle.Secondary).setEmoji('✋'),
  );

  await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
  await interaction.editReply({ content: `✅ Tu ticket ha sido creado: ${channel}` });
}