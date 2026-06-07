const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Warn, Guild } = require('../../database/models');
const { COLORS, errorEmbed, successEmbed, getGuild } = require('../../utils/helpers');
const ms = require('ms');

// Helper: log de moderación
async function modLog(guild, config, embed) {
  if (!config?.modLogChannel) return;
  const ch = guild.channels.cache.get(config.modLogChannel);
  if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('🛡️ Comandos de moderación')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)

    .addSubcommand(s => s.setName('ban').setDescription('🔨 Banear usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón'))
      .addIntegerOption(o => o.setName('dias').setDescription('Días de mensajes a borrar (0-7)').setMinValue(0).setMaxValue(7)))

    .addSubcommand(s => s.setName('kick').setDescription('👢 Expulsar usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón')))

    .addSubcommand(s => s.setName('timeout').setDescription('⏱️ Silenciar temporalmente')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .addStringOption(o => o.setName('duracion').setDescription('Ej: 10m, 1h, 1d').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón')))

    .addSubcommand(s => s.setName('warn').setDescription('⚠️ Advertir usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(true)))

    .addSubcommand(s => s.setName('warns').setDescription('📋 Ver advertencias')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)))

    .addSubcommand(s => s.setName('clearwarns').setDescription('🗑️ Borrar advertencias')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)))

    .addSubcommand(s => s.setName('clear').setDescription('🗑️ Borrar mensajes')
      .addIntegerOption(o => o.setName('cantidad').setDescription('Mensajes a borrar (1-100)').setMinValue(1).setMaxValue(100).setRequired(true)))

    .addSubcommand(s => s.setName('slowmode').setDescription('🐌 Activar slowmode')
      .addIntegerOption(o => o.setName('segundos').setDescription('Segundos (0 = desactivar)').setMinValue(0).setMaxValue(21600).setRequired(true))),

  async execute(interaction, client, config) {
    const sub = interaction.options.getSubcommand();

    // ── BAN ────────────────────────────────────────────────────────────────────
    if (sub === 'ban') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers))
        return interaction.reply({ embeds: [errorEmbed('Necesitas permiso para banear.')], ephemeral: true });

      const target = interaction.options.getMember('usuario');
      const reason = interaction.options.getString('razon') ?? 'Sin razón';
      const days   = interaction.options.getInteger('dias') ?? 0;

      if (!target?.bannable) return interaction.reply({ embeds: [errorEmbed('No puedo banear a ese usuario.')], ephemeral: true });
      if (target.id === interaction.user.id) return interaction.reply({ embeds: [errorEmbed('No puedes banearte a ti mismo.')], ephemeral: true });

      // DM antes del ban
      await target.user.send({ embeds: [new EmbedBuilder().setColor(COLORS.error)
        .setTitle(`🔨 Baneado de ${interaction.guild.name}`)
        .addFields({ name: 'Razón', value: reason }, { name: 'Moderador', value: interaction.user.tag })]
      }).catch(() => {});

      await target.ban({ deleteMessageSeconds: days * 86400, reason: `${interaction.user.tag}: ${reason}` });

      const embed = new EmbedBuilder().setColor(COLORS.error).setTitle('🔨 Usuario baneado')
        .addFields(
          { name: 'Usuario',    value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Moderador',  value: interaction.user.tag,                inline: true },
          { name: 'Razón',      value: reason },
        ).setThumbnail(target.user.displayAvatarURL()).setTimestamp();

      await interaction.reply({ embeds: [embed] });
      await modLog(interaction.guild, config, embed);
    }

    // ── KICK ───────────────────────────────────────────────────────────────────
    else if (sub === 'kick') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers))
        return interaction.reply({ embeds: [errorEmbed('Necesitas permiso para expulsar.')], ephemeral: true });

      const target = interaction.options.getMember('usuario');
      const reason = interaction.options.getString('razon') ?? 'Sin razón';

      if (!target?.kickable) return interaction.reply({ embeds: [errorEmbed('No puedo expulsar a ese usuario.')], ephemeral: true });

      await target.user.send({ embeds: [new EmbedBuilder().setColor(COLORS.warn)
        .setDescription(`👢 Fuiste expulsado de **${interaction.guild.name}**\nRazón: ${reason}`)]
      }).catch(() => {});

      await target.kick(`${interaction.user.tag}: ${reason}`);
      const embed = new EmbedBuilder().setColor(COLORS.warn).setTitle('👢 Usuario expulsado')
        .addFields({ name: 'Usuario', value: target.user.tag, inline: true }, { name: 'Razón', value: reason }).setTimestamp();
      await interaction.reply({ embeds: [embed] });
      await modLog(interaction.guild, config, embed);
    }

    // ── TIMEOUT ────────────────────────────────────────────────────────────────
    else if (sub === 'timeout') {
      const target   = interaction.options.getMember('usuario');
      const durStr   = interaction.options.getString('duracion');
      const reason   = interaction.options.getString('razon') ?? 'Sin razón';
      const duration = ms(durStr);

      if (!duration || duration > 28 * 24 * 60 * 60 * 1000)
        return interaction.reply({ embeds: [errorEmbed('Duración inválida. Ejemplos: `10m`, `1h`, `1d` (máx 28d)')], ephemeral: true });
      if (!target?.moderatable)
        return interaction.reply({ embeds: [errorEmbed('No puedo silenciar a ese usuario.')], ephemeral: true });

      await target.timeout(duration, `${interaction.user.tag}: ${reason}`);
      const until = Math.floor((Date.now() + duration) / 1000);
      const embed = new EmbedBuilder().setColor(COLORS.warn).setTitle('⏱️ Timeout aplicado')
        .addFields(
          { name: 'Usuario',   value: target.user.tag, inline: true },
          { name: 'Duración',  value: durStr,          inline: true },
          { name: 'Hasta',     value: `<t:${until}:R>`, inline: true },
          { name: 'Razón',     value: reason },
        ).setTimestamp();
      await interaction.reply({ embeds: [embed] });
      await modLog(interaction.guild, config, embed);
    }

    // ── WARN ───────────────────────────────────────────────────────────────────
    else if (sub === 'warn') {
      const target = interaction.options.getUser('usuario');
      const reason = interaction.options.getString('razon');
      await Warn.create({ guildId: interaction.guildId, userId: target.id, moderator: interaction.user.id, reason });
      const count = await Warn.countDocuments({ guildId: interaction.guildId, userId: target.id, active: true });
      const embed = new EmbedBuilder().setColor(COLORS.warn).setTitle('⚠️ Advertencia registrada')
        .addFields(
          { name: 'Usuario',        value: target.tag,           inline: true },
          { name: 'Moderador',      value: interaction.user.tag, inline: true },
          { name: 'Total warns',    value: `${count}`,            inline: true },
          { name: 'Razón',          value: reason },
        ).setTimestamp();
      await interaction.reply({ embeds: [embed] });
      await modLog(interaction.guild, config, embed);
      target.send({ embeds: [new EmbedBuilder().setColor(COLORS.warn)
        .setDescription(`⚠️ Recibiste una advertencia en **${interaction.guild.name}**\n**Razón:** ${reason}\n**Total:** ${count}`)]
      }).catch(() => {});
    }

    // ── WARNS ──────────────────────────────────────────────────────────────────
    else if (sub === 'warns') {
      const target = interaction.options.getUser('usuario');
      const warns  = await Warn.find({ guildId: interaction.guildId, userId: target.id, active: true }).sort('-createdAt');
      if (!warns.length) return interaction.reply({ embeds: [successEmbed(`**${target.username}** no tiene advertencias.`)] });
      const list = warns.map((w, i) => `**${i + 1}.** ${w.reason} — <@${w.moderator}> <t:${Math.floor(w.createdAt / 1000)}:R>`).join('\n');
      interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.warn).setTitle(`⚠️ Warns de ${target.username}`).setDescription(list)] });
    }

    // ── CLEARWARNS ─────────────────────────────────────────────────────────────
    else if (sub === 'clearwarns') {
      const target = interaction.options.getUser('usuario');
      await Warn.updateMany({ guildId: interaction.guildId, userId: target.id }, { active: false });
      interaction.reply({ embeds: [successEmbed(`Advertencias de **${target.username}** borradas.`)] });
    }

    // ── CLEAR ──────────────────────────────────────────────────────────────────
    else if (sub === 'clear') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages))
        return interaction.reply({ embeds: [errorEmbed('Necesitas permiso para gestionar mensajes.')], ephemeral: true });
      const amount   = interaction.options.getInteger('cantidad');
      const deleted  = await interaction.channel.bulkDelete(amount, true);
      const reply    = await interaction.reply({ embeds: [successEmbed(`Eliminados **${deleted.size}** mensajes.`)], fetchReply: true });
      setTimeout(() => reply.delete().catch(() => {}), 4000);
    }

    // ── SLOWMODE ───────────────────────────────────────────────────────────────
    else if (sub === 'slowmode') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return interaction.reply({ embeds: [errorEmbed('Necesitas permiso para gestionar canales.')], ephemeral: true });
      const secs = interaction.options.getInteger('segundos');
      await interaction.channel.setRateLimitPerUser(secs);
      interaction.reply({ embeds: [successEmbed(secs === 0 ? 'Slowmode desactivado.' : `Slowmode activado: **${secs}s** por mensaje.`)] });
    }
  },
};
