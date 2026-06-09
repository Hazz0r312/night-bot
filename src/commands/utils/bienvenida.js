const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { Guild } = require('../../database/models');
const { COLORS, successEmbed, errorEmbed } = require('../../utils/helpers');

module.exports = {
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('bienvenida')
    .setDescription('👋 Configura el sistema de bienvenida')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s
      .setName('activar')
      .setDescription('Activar bienvenida en un canal')
      .addChannelOption(o => o.setName('canal').setDescription('Canal de bienvenida').setRequired(true))
      .addStringOption(o => o.setName('mensaje').setDescription('Mensaje personalizado (opcional)').setRequired(false)))
    .addSubcommand(s => s
      .setName('desactivar')
      .setDescription('Desactivar el sistema de bienvenida'))
    .addSubcommand(s => s
      .setName('test')
      .setDescription('Probar cómo se ve el mensaje de bienvenida'))
    .addSubcommand(s => s
      .setName('config')
      .setDescription('Ver la configuración actual')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'activar') {
      const canal   = interaction.options.getChannel('canal');
      const mensaje = interaction.options.getString('mensaje');

      await Guild.findOneAndUpdate(
        { guildId: interaction.guildId },
        {
          welcomeEnabled: true,
          welcomeChannel: canal.id,
          ...(mensaje ? { welcomeMessage: mensaje } : {}),
        },
        { upsert: true }
      );

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle('✅ Bienvenida activada')
          .setDescription(`Los nuevos miembros serán bienvenidos en ${canal}.`)
          .addFields(
            { name: '📋 Variables disponibles', value: '`{user}` — mención\n`{username}` — nombre\n`{server}` — servidor\n`{count}` — nº de miembros' }
          )
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'desactivar') {
      await Guild.findOneAndUpdate(
        { guildId: interaction.guildId },
        { welcomeEnabled: false },
        { upsert: true }
      );
      return interaction.reply({ embeds: [successEmbed('Sistema de bienvenida desactivado.')], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'test') {
      const config = await Guild.findOne({ guildId: interaction.guildId });
      if (!config?.welcomeEnabled || !config?.welcomeChannel) {
        return interaction.reply({ embeds: [errorEmbed('Primero activa la bienvenida con `/bienvenida activar`.')], flags: MessageFlags.Ephemeral });
      }
      // Simular bienvenida con el usuario actual
      await sendWelcome(interaction.member, interaction.guild, config);
      return interaction.reply({ embeds: [successEmbed('Mensaje de prueba enviado.')], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'config') {
      const config = await Guild.findOne({ guildId: interaction.guildId });
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.main)
          .setTitle('⚙️ Configuración de bienvenida')
          .addFields(
            { name: 'Estado',   value: config?.welcomeEnabled ? '✅ Activada' : '❌ Desactivada', inline: true },
            { name: 'Canal',    value: config?.welcomeChannel ? `<#${config.welcomeChannel}>` : 'Sin configurar', inline: true },
            { name: 'Mensaje',  value: config?.welcomeMessage || 'Por defecto' },
          )
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

// Exportar función para usarla en el evento guildMemberAdd
async function sendWelcome(member, guild, config) {
  const channel = guild.channels.cache.get(config.welcomeChannel);
  if (!channel) return;

  const text = (config.welcomeMessage || '¡Bienvenido/a {user} a **{server}**! 🎉 Eres el miembro #**{count}**.')
    .replace('{user}',     `<@${member.id}>`)
    .replace('{username}', member.user?.username || member.displayName)
    .replace('{server}',   guild.name)
    .replace('{count}',    guild.memberCount);

  const joinedDate = member.user?.createdAt
    ? `<t:${Math.floor(member.user.createdAt.getTime() / 1000)}:R>`
    : 'Desconocido';

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({
      name:    `¡Nuevo miembro en ${guild.name}!`,
      iconURL: guild.iconURL({ dynamic: true }) || null,
    })
    .setThumbnail(member.user?.displayAvatarURL({ dynamic: true, size: 256 }) || null)
    .setDescription(`${text}`)
    .addFields(
      { name: '📅 Cuenta creada',     value: joinedDate,               inline: true },
      { name: '👥 Total de miembros', value: `${guild.memberCount}`,   inline: true },
    )
    .setImage('https://i.imgur.com/placeholder.png') // Banner opcional
    .setFooter({ text: `ID: ${member.id}` })
    .setTimestamp();

  // Quitar el setImage si no tienes banner
  embed.data.image = undefined;

  await channel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(() => {});
}

module.exports.sendWelcome = sendWelcome;
