const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'help',
  description: 'Muestra la lista de comandos disponibles del bot.',
  cooldown: 5,
  async execute(message, args, client) {
    const embed = new EmbedBuilder()
      .setTitle('🌙 Lista de Comandos - Night Bot v2')
      .setDescription('Aquí tienes los comandos de texto que puedes utilizar actualmente:')
      .setColor('#2f3136')
      .addFields(
        { name: '🎵 Música', value: '`!play <canción>`', inline: true },
        { name: '🛠️ Utilidades', value: '`!help`', inline: true }
      )
      .setFooter({ text: client.user.username, iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};