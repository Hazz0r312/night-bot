const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Warn, Guild } = require('../../database/models');

module.exports = {
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('⚠️ Advertir a un usuario')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(s => s.setName('add').setDescription('Añadir una advertencia')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('Ver advertencias de un usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)))
    .addSubcommand(s => s.setName('clear').setDescription('Borrar advertencias de un usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))),

  async execute(interaction) {
    const sub    = interaction.options.getSubcommand();
    const target = interaction.options.getUser('usuario');

    if (sub === 'add') {
      const reason = interaction.options.getString('razon');
      await Warn.create({ guildId: interaction.guildId, userId: target.id, moderator: interaction.user.id, reason });

      const count = await Warn.countDocuments({ guildId: interaction.guildId, userId: target.id, active: true });

      const embed = new EmbedBuilder()
        .setColor('#faa61a')
        .setTitle('⚠️ Advertencia registrada')
        .addFields(
          { name: 'Usuario', value: `${target.tag}`, inline: true },
          { name: 'Moderador', value: interaction.user.tag, inline: true },
          { name: 'Total de advertencias', value: `${count}`, inline: true },
          { name: 'Razón', value: reason }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      // Notificar al usuario
      target.send({ embeds: [new EmbedBuilder()
        .setColor('#faa61a')
        .setDescription(`⚠️ Has recibido una advertencia en **${interaction.guild.name}**\n**Razón:** ${reason}\n**Total:** ${count} advertencias`)]
      }).catch(() => {});

    } else if (sub === 'list') {
      const warns = await Warn.find({ guildId: interaction.guildId, userId: target.id, active: true }).sort({ createdAt: -1 });

      if (!warns.length) return interaction.reply({ content: `✅ ${target.tag} no tiene advertencias activas.`, ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor('#faa61a')
        .setTitle(`⚠️ Advertencias de ${target.tag}`)
        .setDescription(warns.map((w, i) =>
          `**${i + 1}.** ${w.reason}\n> <@${w.moderator}> • <t:${Math.floor(w.createdAt / 1000)}:R>`
        ).join('\n\n'));

      await interaction.reply({ embeds: [embed] });

    } else if (sub === 'clear') {
      await Warn.updateMany({ guildId: interaction.guildId, userId: target.id }, { active: false });
      await interaction.reply({ embeds: [new EmbedBuilder().setColor('#57f287').setDescription(`✅ Advertencias de **${target.tag}** borradas.`)] });
    }
  },
};
