const { Guild } = require('../database/models');
const { sendWelcome } = require('../commands/utils/bienvenida');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    if (member.user.bot) return;

    try {
      const config = await Guild.findOne({ guildId: member.guild.id });
      if (!config) return;

      // Auto-rol
      if (config.autoRoleId) {
        const role = member.guild.roles.cache.get(config.autoRoleId);
        if (role) member.roles.add(role).catch(() => {});
      }

      // Bienvenida
      if (config.welcomeEnabled && config.welcomeChannel) {
        await sendWelcome(member, member.guild, config);
      }
    } catch (err) {
      console.error('Error en guildMemberAdd:', err.message);
    }
  },
};
