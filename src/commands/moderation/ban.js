const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Warn } = require('../../database/models');

module.exports = {
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('🔨 Banear a un usuario del servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
    .addStringOption(o => o.setName('razon').setDescription('Razón del ban').setRequired(false))
    .addIntegerOption(o => o.setName('dias').setDescription('Días de mensajes a borrar (0-7)').setMinValue(0).setMaxValue(7).setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getMember('usuario');
    const reason = interaction.options.getString('razon') ?? 'Sin razón especificada';
    const days   = interaction.options.getInteger('dias') ?? 0;

    if (!target) return interaction.reply({ content: '❌ Usuario no encontrado en este servidor.', ephemeral: true });
    if (target.id === interaction.user.id) return interaction.reply({ content: '❌ No puedes banearte a ti mismo.', ephemeral: true });
    if (!target.bannable) return interaction.reply({ content: '❌ No puedo banear a este usuario (permisos insuficientes).', ephemeral: true });

    try {
      // Notificar al usuario antes del ban
      await target.user.send({ embeds: [new EmbedBuilder()
        .setColor('#ed4245')
        .setTitle(`Has sido baneado de ${interaction.guild.name}`)
        .addFields(
          { name: 'Razón', value: reason },
          { name: 'Moderador', value: interaction.user.tag }
        )
        .setTimestamp()]
      }).catch(() => {});

      await target.ban({ deleteMessageDays: days, reason: `${interaction.user.tag}: ${reason}` });

      const embed = new EmbedBuilder()
        .setColor('#ed4245')
        .setTitle('🔨 Usuario baneado')
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
          { name: 'Usuario', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Moderador', value: interaction.user.tag, inline: true },
          { name: 'Razón', value: reason }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      // Log en canal de moderación
      const guildConfig = await require('../../database/models').Guild.findOne({ guildId: interaction.guildId });
      if (guildConfig?.modLogChannel) {
        const logChannel = interaction.guild.channels.cache.get(guildConfig.modLogChannel);
        if (logChannel) logChannel.send({ embeds: [embed] });
      }

    } catch (err) {
      interaction.reply({ content: `❌ Error al banear: ${err.message}`, ephemeral: true });
    }
  },
};
