const { EmbedBuilder } = require('discord.js');
const { getGuild }     = require('../utils/helpers');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    if (member.user.bot) return;

    const config = await getGuild(member.guild.id);
    if (!config) return;

    // ─── Auto-rol ──────────────────────────────────────────────────────────────
    if (config.autoRoleId) {
      const role = member.guild.roles.cache.get(config.autoRoleId);
      if (role) {
        member.roles.add(role).catch(err =>
          console.error(`❌ Auto-rol: no pude añadir rol a ${member.user.tag}:`, err.message)
        );
      }
    }

    // ─── Mensaje de bienvenida ─────────────────────────────────────────────────
    if (!config.welcomeEnabled || !config.welcomeChannel) return;

    const channel = member.guild.channels.cache.get(config.welcomeChannel);
    if (!channel) {
      console.warn(`⚠️ Canal de bienvenida ${config.welcomeChannel} no encontrado en ${member.guild.name}`);
      return;
    }

    const text = config.welcomeMessage
      .replace('{user}',     `<@${member.id}>`)
      .replace('{username}', member.user.username)
      .replace('{server}',   member.guild.name)
      .replace('{count}',    member.guild.memberCount);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({ name: member.guild.name, iconURL: member.guild.iconURL({ dynamic: true }) })
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription(text)
      .addFields({ name: '📅 Cuenta creada', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true })
      .setFooter({ text: `ID: ${member.id}` })
      .setTimestamp();

    channel.send({ embeds: [embed] }).catch(err =>
      console.error('❌ Error enviando bienvenida:', err.message)
    );
  },
};