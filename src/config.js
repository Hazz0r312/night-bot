const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Guild } = require('../../database/models');
const { COLORS, successEmbed, errorEmbed } = require('../../utils/helpers');

module.exports = {
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('⚙️ Configurar Night Bot en este servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand(s => s.setName('bienvenida').setDescription('Configurar sistema de bienvenida')
      .addBooleanOption(o => o.setName('activar').setDescription('Activar/desactivar').setRequired(true))
      .addChannelOption(o => o.setName('canal').setDescription('Canal de bienvenida'))
      .addStringOption(o => o.setName('mensaje').setDescription('Mensaje ({user}, {username}, {server}, {count})')))

    .addSubcommand(s => s.setName('despedida').setDescription('Configurar mensaje de despedida')
      .addBooleanOption(o => o.setName('activar').setDescription('Activar/desactivar').setRequired(true))
      .addChannelOption(o => o.setName('canal').setDescription('Canal de despedida'))
      .addStringOption(o => o.setName('mensaje').setDescription('Mensaje ({username}, {server}, {count})')))

    .addSubcommand(s => s.setName('autorole').setDescription('Rol automático al entrar')
      .addRoleOption(o => o.setName('rol').setDescription('Rol a dar (vacío = desactivar)')))

    .addSubcommand(s => s.setName('niveles').setDescription('Configurar sistema de niveles')
      .addBooleanOption(o => o.setName('activar').setDescription('Activar/desactivar').setRequired(true))
      .addChannelOption(o => o.setName('canal').setDescription('Canal de subida de nivel (vacío = donde chatean'))
      .addStringOption(o => o.setName('mensaje').setDescription('Mensaje ({user}, {level})')))

    .addSubcommand(s => s.setName('logs').setDescription('Canal de logs de moderación')
      .addChannelOption(o => o.setName('canal').setDescription('Canal de logs (vacío = desactivar)')))

    .addSubcommand(s => s.setName('tickets').setDescription('Configurar tickets')
      .addChannelOption(o => o.setName('categoria').setDescription('Categoría para los tickets'))
      .addChannelOption(o => o.setName('logs').setDescription('Canal de logs de tickets'))
      .addRoleOption(o => o.setName('staff').setDescription('Rol de soporte')))

    .addSubcommand(s => s.setName('antilinks').setDescription('Activar/desactivar anti-links')
      .addBooleanOption(o => o.setName('activar').setDescription('Activar/desactivar').setRequired(true)))

    .addSubcommand(s => s.setName('palabras').setDescription('Añadir/quitar palabras prohibidas')
      .addStringOption(o => o.setName('accion').setDescription('add o remove').setRequired(true)
        .addChoices({ name: '➕ Añadir', value: 'add' }, { name: '➖ Quitar', value: 'remove' }, { name: '📋 Ver lista', value: 'list' }))
      .addStringOption(o => o.setName('palabra').setDescription('Palabra')))

    .addSubcommand(s => s.setName('economia').setDescription('Configurar economía')
      .addStringOption(o => o.setName('nombre').setDescription('Nombre de la moneda'))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji de la moneda')))

    .addSubcommand(s => s.setName('ver').setDescription('Ver configuración actual')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // ── VER ───────────────────────────────────────────────────────────────────
    if (sub === 'ver') {
      const g = await Guild.findOne({ guildId }) || {};
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.main)
        .setTitle(`⚙️ Configuración — ${interaction.guild.name}`)
        .addFields(
          { name: '👋 Bienvenida', value: g.welcomeEnabled ? `✅ <#${g.welcomeChannel}>` : '❌', inline: true },
          { name: '👢 Despedida',  value: g.leaveEnabled   ? `✅ <#${g.leaveChannel}>`   : '❌', inline: true },
          { name: '🎭 Auto-rol',   value: g.autoRoleId     ? `<@&${g.autoRoleId}>`        : '❌', inline: true },
          { name: '⭐ Niveles',    value: g.levelsEnabled  ? '✅' : '❌',                        inline: true },
          { name: '📋 Logs mod',   value: g.modLogChannel  ? `<#${g.modLogChannel}>`      : '❌', inline: true },
          { name: '🔗 Anti-links', value: g.antiLinks      ? '✅' : '❌',                        inline: true },
          { name: '💰 Moneda',     value: `${g.currencyEmoji || '🪙'} ${g.currencyName || 'coins'}`, inline: true },
          { name: '⭐ Premium',    value: g.premium        ? `✅ hasta <t:${Math.floor(g.premiumExpires/1000)}:D>` : '❌', inline: true },
        )
        .setTimestamp()]
      });
    }

    // ── BIENVENIDA ────────────────────────────────────────────────────────────
    if (sub === 'bienvenida') {
      const activar = interaction.options.getBoolean('activar');
      const canal   = interaction.options.getChannel('canal');
      const msg     = interaction.options.getString('mensaje');
      const update  = { welcomeEnabled: activar };
      if (canal) update.welcomeChannel = canal.id;
      if (msg)   update.welcomeMessage = msg;
      await Guild.updateOne({ guildId }, update, { upsert: true });
      return interaction.reply({ embeds: [successEmbed(activar
        ? `Bienvenida activada${canal ? ` en ${canal}` : ''}.${msg ? `\nMensaje: \`${msg}\`` : ''}`
        : 'Bienvenida desactivada.')] });
    }

    // ── DESPEDIDA ─────────────────────────────────────────────────────────────
    if (sub === 'despedida') {
      const activar = interaction.options.getBoolean('activar');
      const canal   = interaction.options.getChannel('canal');
      const msg     = interaction.options.getString('mensaje');
      const update  = { leaveEnabled: activar };
      if (canal) update.leaveChannel = canal.id;
      if (msg)   update.leaveMessage = msg;
      await Guild.updateOne({ guildId }, update, { upsert: true });
      return interaction.reply({ embeds: [successEmbed(activar ? `Despedida activada${canal ? ` en ${canal}` : ''}.` : 'Despedida desactivada.')] });
    }

    // ── AUTOROLE ──────────────────────────────────────────────────────────────
    if (sub === 'autorole') {
      const rol = interaction.options.getRole('rol');
      await Guild.updateOne({ guildId }, { autoRoleId: rol?.id || null }, { upsert: true });
      return interaction.reply({ embeds: [successEmbed(rol ? `Auto-rol configurado: ${rol}` : 'Auto-rol desactivado.')] });
    }

    // ── NIVELES ───────────────────────────────────────────────────────────────
    if (sub === 'niveles') {
      const activar = interaction.options.getBoolean('activar');
      const canal   = interaction.options.getChannel('canal');
      const msg     = interaction.options.getString('mensaje');
      const update  = { levelsEnabled: activar };
      if (canal) update.levelChannel = canal.id;
      if (msg)   update.levelMessage = msg;
      await Guild.updateOne({ guildId }, update, { upsert: true });
      return interaction.reply({ embeds: [successEmbed(activar ? `Sistema de niveles activado.` : 'Sistema de niveles desactivado.')] });
    }

    // ── LOGS ──────────────────────────────────────────────────────────────────
    if (sub === 'logs') {
      const canal = interaction.options.getChannel('canal');
      await Guild.updateOne({ guildId }, { modLogChannel: canal?.id || null }, { upsert: true });
      return interaction.reply({ embeds: [successEmbed(canal ? `Logs de moderación → ${canal}` : 'Logs desactivados.')] });
    }

    // ── TICKETS ───────────────────────────────────────────────────────────────
    if (sub === 'tickets') {
      const cat   = interaction.options.getChannel('categoria');
      const logs  = interaction.options.getChannel('logs');
      const staff = interaction.options.getRole('staff');
      const update = {};
      if (cat)   update.ticketCategory   = cat.id;
      if (logs)  update.ticketLogChannel = logs.id;
      if (staff) update.$addToSet = { ticketSupportRoles: staff.id };
      await Guild.updateOne({ guildId }, update, { upsert: true });
      return interaction.reply({ embeds: [successEmbed('Tickets configurados.\n' + [
        cat   ? `Categoría: ${cat}`   : '',
        logs  ? `Logs: ${logs}`        : '',
        staff ? `Staff: ${staff}`      : '',
      ].filter(Boolean).join('\n'))] });
    }

    // ── ANTILINKS ─────────────────────────────────────────────────────────────
    if (sub === 'antilinks') {
      const activar = interaction.options.getBoolean('activar');
      await Guild.updateOne({ guildId }, { antiLinks: activar }, { upsert: true });
      return interaction.reply({ embeds: [successEmbed(activar ? 'Anti-links activado.' : 'Anti-links desactivado.')] });
    }

    // ── PALABRAS ──────────────────────────────────────────────────────────────
    if (sub === 'palabras') {
      const accion  = interaction.options.getString('accion');
      const palabra = interaction.options.getString('palabra');

      if (accion === 'list') {
        const g = await Guild.findOne({ guildId });
        const words = g?.bannedWords || [];
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.main)
          .setTitle('🚫 Palabras prohibidas')
          .setDescription(words.length ? words.map(w => `\`${w}\``).join(', ') : 'Lista vacía.')] });
      }
      if (!palabra) return interaction.reply({ embeds: [errorEmbed('Escribe una palabra.')], ephemeral: true });

      if (accion === 'add') {
        await Guild.updateOne({ guildId }, { $addToSet: { bannedWords: palabra.toLowerCase() } }, { upsert: true });
        return interaction.reply({ embeds: [successEmbed(`Palabra \`${palabra}\` añadida.`)] });
      }
      if (accion === 'remove') {
        await Guild.updateOne({ guildId }, { $pull: { bannedWords: palabra.toLowerCase() } });
        return interaction.reply({ embeds: [successEmbed(`Palabra \`${palabra}\` eliminada.`)] });
      }
    }

    // ── ECONOMÍA ──────────────────────────────────────────────────────────────
    if (sub === 'economia') {
      const nombre = interaction.options.getString('nombre');
      const emoji  = interaction.options.getString('emoji');
      const update = {};
      if (nombre) update.currencyName  = nombre;
      if (emoji)  update.currencyEmoji = emoji;
      if (!nombre && !emoji) return interaction.reply({ embeds: [errorEmbed('Especifica nombre o emoji.')], ephemeral: true });
      await Guild.updateOne({ guildId }, update, { upsert: true });
      return interaction.reply({ embeds: [successEmbed(`Moneda actualizada: ${emoji || '🪙'} ${nombre || 'coins'}`)] });
    }
  },
};
