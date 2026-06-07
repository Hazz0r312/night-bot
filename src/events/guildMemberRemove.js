const { EmbedBuilder } = require('discord.js');
const { getGuild }     = require('../utils/helpers');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    if (member.user.bot) return;
    const config = await getGuild(member.guild.id);
    if (!config?.leaveEnabled || !config.leaveChannel) return;

    const channel = member.guild.channels.cache.get(config.leaveChannel);
    if (!channel) return;

    const text = config.leaveMessage
      .replace('{user}',     `<@${member.id}>`)
      .replace('{username}', member.user.username)
      .replace('{server}',   member.guild.name)
      .replace('{count}',    member.guild.memberCount);

    channel.send({ embeds: [new EmbedBuilder()
      .setColor(0xED4245)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setDescription(text)
      .setTimestamp()]
    }).catch(() => {});
  },
};
