const {
  EmbedBuilder, Collection, PermissionFlagsBits, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { getGuild, errorEmbed } = require('../utils/helpers');
const { Ticket } = require('../database/models');

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

const EPH = { flags: MessageFlags.Ephemeral };

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
            ...EPH,
          });
        }
      }
      stamps.set(interaction.user.id, now);
      setTimeout(() => stamps.delete(interaction.user.id), cdMs);

      // Config del servidor con fallback
      let guildConfig = { ...DEFAULT_CONFIG };
      try {
        const dbConfig = await getGuild(interaction.guildId);
        if (dbConfig) {
          const raw = typeof dbConfig.toObject === 'function' ? dbConfig.toObject() : dbConfig;
          guildConfig = { ...DEFAULT_CONFIG, ...raw };
        }
      } catch (dbErr) {
        console.error('⚠️ DB config fallback:', dbErr.message);
      }

      try {
        await command.execute(interaction, client, guildConfig);
      } catch (err) {
        console.error(`❌ Error en /${interaction.commandName}:`, err);
        const reply = { embeds: [errorEmbed('Hubo un error al ejecutar este comando.')], ...EPH };
        if (interaction.replied || interaction.deferred) interaction.followUp(reply).catch(() => {});
        else interaction.reply(reply).catch(() => {});
      }
      return;
    }

    // ─── BUTTONS ──────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
      const { customId, guild, member } = interaction;

      // ── Abrir ticket desde panel ───────────────────────────────────────────
      if (customId === 'ticket_panel_open') {
        // Mostrar modal para que el usuario escriba el tema
        const modal = new ModalBuilder()
          .setCustomId('ticket_modal')
          .setTitle('📩 Abrir un Ticket de Soporte');

        const topicInput = new TextInputBuilder()
          .setCustomId('ticket_topic')
          .setLabel('¿En qué podemos ayudarte?')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(500)
          .setPlaceholder('Describe tu problema o pregunta con detalle...')
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(topicInput));
        await interaction.showModal(modal);
        return;
      }

      // ── Cerrar ticket ──────────────────────────────────────────────────────
      if (customId === 'ticket_close') {
        const ticket = await Ticket.findOne({ channelId: interaction.channelId, status: 'open' });
        if (!ticket) return interaction.reply({ content: '❌ Este no es un ticket abierto.', ...EPH });

        // Solo el staff puede cerrar
        const isStaff = member.permissions.has(PermissionFlagsBits.ManageChannels);

        if (!isStaff) {
          return interaction.reply({ content: '❌ Solo el staff puede cerrar tickets.', ...EPH });
        }

        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('🔒 Cerrando ticket en **5 segundos**...')]
        });
        await Ticket.updateOne({ _id: ticket._id }, { status: 'closed' });

        // Log en canal configurado
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
                { name: 'Ticket',      value: `#${ticket.ticketNum} — ${ticket.topic}`, inline: true },
                { name: 'Creado por',  value: `<@${ticket.userId}>`,                    inline: true },
                { name: 'Cerrado por', value: `<@${interaction.user.id}>`,              inline: true },
              )
              .setTimestamp()]
            }).catch(() => {});
          }
        }

        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        return;
      }

      // ── Reclamar ticket ────────────────────────────────────────────────────
      if (customId === 'ticket_claim') {
        const ticket = await Ticket.findOne({ channelId: interaction.channelId });
        if (!ticket) return;
        if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return interaction.reply({ content: '❌ Solo el staff puede reclamar tickets.', ...EPH });
        }
        if (ticket.claimedBy) {
          return interaction.reply({ content: `❌ Este ticket ya fue reclamado por <@${ticket.claimedBy}>.`, ...EPH });
        }
        await Ticket.updateOne({ _id: ticket._id }, { claimedBy: interaction.user.id });
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Ticket reclamado por <@${interaction.user.id}>. Ahora eres el responsable.`)]
        });
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

// ─── Crear ticket ─────────────────────────────────────────────────────────────
async function createTicket(interaction, client) {
  await interaction.deferReply({ ...EPH });

  const topic = interaction.fields.getTextInputValue('ticket_topic');
  const guild = interaction.guild;

  let gConfig = { ...DEFAULT_CONFIG };
  try {
    const db = await getGuild(guild.id);
    if (db) gConfig = { ...DEFAULT_CONFIG, ...(db.toObject?.() ?? db) };
  } catch {}

  // Comprobar si ya tiene un ticket abierto
  const existing = await Ticket.findOne({ guildId: guild.id, userId: interaction.user.id, status: 'open' });
  if (existing) {
    return interaction.editReply({ content: `❌ Ya tienes un ticket abierto: <#${existing.channelId}>` });
  }

  const ticketNum = (await Ticket.countDocuments({ guildId: guild.id })) + 1;
  const name      = `ticket-${String(ticketNum).padStart(4, '0')}`;

  // Permisos del canal
  const overwrites = [
    { id: guild.id,            deny:  [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: client.user.id,      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];

  // Añadir roles de soporte configurados
  for (const rId of (gConfig.ticketSupportRoles || [])) {
    try {
      overwrites.push({ id: rId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
    } catch {}
  }

  // Dar acceso automático a cualquier miembro con permiso ManageChannels (admins/mods)
  const staffMembers = guild.members.cache.filter(m =>
    m.permissions.has(PermissionFlagsBits.ManageChannels) && !m.user.bot
  );
  for (const [, staffMember] of staffMembers) {
    if (!overwrites.find(o => o.id === staffMember.id)) {
      overwrites.push({
        id: staffMember.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
      });
    }
  }

  // Crear canal
  let channel;
  try {
    channel = await guild.channels.create({
      name,
      type:   ChannelType.GuildText,
      parent: gConfig.ticketCategory || null,
      permissionOverwrites: overwrites,
    });
  } catch (err) {
    return interaction.editReply({ content: `❌ No pude crear el canal. Asegúrate de que el bot tiene permisos de **Gestionar Canales**.\nError: ${err.message}` });
  }

  await Ticket.create({ guildId: guild.id, userId: interaction.user.id, channelId: channel.id, ticketNum, topic });

  const msg = (gConfig.ticketMessage || '¡Hola {user}! El equipo te atenderá pronto.\n**Tema:** {topic}')
    .replace('{user}',  `<@${interaction.user.id}>`)
    .replace('{topic}', topic);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎫 Ticket #${String(ticketNum).padStart(4, '0')}`)
    .setDescription(msg)
    .addFields(
      { name: '📋 Tema',      value: topic },
      { name: '👤 Creado por', value: `<@${interaction.user.id}>`, inline: true },
      { name: '📅 Fecha',      value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
    )
    .setFooter({ text: 'El creador del ticket también puede cerrarlo' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Reclamar').setStyle(ButtonStyle.Secondary).setEmoji('✋'),
  );

  await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
  await interaction.editReply({ content: `✅ Tu ticket ha sido creado: ${channel}` });
}
