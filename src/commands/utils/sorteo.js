const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { errorEmbed, COLORS } = require('../../utils/helpers');

// Almacena sorteos activos en memoria
const sorteos = new Map();

module.exports = {
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('sorteo')
    .setDescription('🎉 Sistema de sorteos')
    .addSubcommand(s => s
      .setName('crear')
      .setDescription('Crear un nuevo sorteo')
      .addStringOption(o => o.setName('premio').setDescription('Premio del sorteo').setRequired(true))
      .addIntegerOption(o => o.setName('duracion').setDescription('Duración en minutos').setMinValue(1).setMaxValue(10080).setRequired(true))
      .addIntegerOption(o => o.setName('ganadores').setDescription('Número de ganadores').setMinValue(1).setMaxValue(20).setRequired(false))
      .addChannelOption(o => o.setName('canal').setDescription('Canal del sorteo (por defecto el actual)').setRequired(false))
      .addStringOption(o => o.setName('requisito').setDescription('Requisito para participar (opcional)').setRequired(false)))
    .addSubcommand(s => s
      .setName('terminar')
      .setDescription('Terminar un sorteo antes de tiempo')
      .addStringOption(o => o.setName('id').setDescription('ID del mensaje del sorteo').setRequired(true)))
    .addSubcommand(s => s
      .setName('rerollear')
      .setDescription('Elegir nuevo ganador de un sorteo terminado')
      .addStringOption(o => o.setName('id').setDescription('ID del mensaje del sorteo').setRequired(true))),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    // ── CREAR ─────────────────────────────────────────────────────────────────
    if (sub === 'crear') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [errorEmbed('Necesitas el permiso **Gestionar Servidor** para crear sorteos.')], flags: MessageFlags.Ephemeral });
      }

      const premio    = interaction.options.getString('premio');
      const duracion  = interaction.options.getInteger('duracion');
      const ganadores = interaction.options.getInteger('ganadores') || 1;
      const canal     = interaction.options.getChannel('canal') || interaction.channel;
      const requisito = interaction.options.getString('requisito');

      const fin = new Date(Date.now() + duracion * 60 * 1000);

      const embed = new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle('🎉 ¡SORTEO!')
        .setDescription(
          `**Premio:** ${premio}\n\n` +
          `Reacciona con 🎉 para participar!\n\n` +
          (requisito ? `**Requisito:** ${requisito}\n\n` : '') +
          `**Ganadores:** ${ganadores}\n` +
          `**Termina:** <t:${Math.floor(fin.getTime() / 1000)}:R> (<t:${Math.floor(fin.getTime() / 1000)}:F>)`
        )
        .setFooter({ text: `Organizado por ${interaction.user.username}` })
        .setTimestamp(fin);

      const msg = await canal.send({ embeds: [embed] });
      await msg.react('🎉');

      // Guardar en memoria
      sorteos.set(msg.id, {
        premio, ganadores, fin, canal: canal.id,
        organizador: interaction.user.id,
        messageId: msg.id,
        guildId: interaction.guildId,
      });

      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(`✅ Sorteo creado en ${canal}!\n**Premio:** ${premio}\n**Duración:** ${duracion} minutos\n**Ganadores:** ${ganadores}`)],
        flags: MessageFlags.Ephemeral,
      });

      // Timer para terminar el sorteo automáticamente
      setTimeout(async () => {
        await terminarSorteo(msg.id, canal, client, interaction.guild);
      }, duracion * 60 * 1000);
    }

    // ── TERMINAR ──────────────────────────────────────────────────────────────
    else if (sub === 'terminar') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [errorEmbed('Necesitas el permiso **Gestionar Servidor**.')], flags: MessageFlags.Ephemeral });
      }

      const id = interaction.options.getString('id');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const msg = await interaction.channel.messages.fetch(id);
        await terminarSorteo(id, interaction.channel, client, interaction.guild);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription('✅ Sorteo terminado manualmente.')] });
      } catch {
        await interaction.editReply({ embeds: [errorEmbed('No encontré ese mensaje. Asegúrate de estar en el canal correcto y que el ID sea válido.')] });
      }
    }

    // ── REROLLEAR ─────────────────────────────────────────────────────────────
    else if (sub === 'rerollear') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [errorEmbed('Necesitas el permiso **Gestionar Servidor**.')], flags: MessageFlags.Ephemeral });
      }

      const id = interaction.options.getString('id');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const msg     = await interaction.channel.messages.fetch(id);
        const reaction = msg.reactions.cache.get('🎉');

        if (!reaction) {
          return interaction.editReply({ embeds: [errorEmbed('No hay reacciones 🎉 en ese mensaje.')] });
        }

        const users = await reaction.users.fetch();
        const valid = users.filter(u => !u.bot);

        if (valid.size === 0) {
          return interaction.editReply({ embeds: [errorEmbed('No hay participantes válidos.')] });
        }

        const ganador = valid.random();

        await interaction.channel.send({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.gold)
            .setTitle('🎉 ¡Nuevo ganador!')
            .setDescription(`El nuevo ganador es: <@${ganador.id}> 🎊\n\n[Ver sorteo original](${msg.url})`)
            .setTimestamp()
          ],
        });

        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(`✅ Nuevo ganador elegido: **${ganador.username}**`)] });
      } catch {
        await interaction.editReply({ embeds: [errorEmbed('No encontré ese mensaje.')] });
      }
    }
  },
};

// ─── Función para terminar el sorteo ──────────────────────────────────────────
async function terminarSorteo(messageId, channel, client, guild) {
  try {
    const msg      = await channel.messages.fetch(messageId);
    const reaction = msg.reactions.cache.get('🎉');
    const sorteo   = sorteos.get(messageId);
    const numGanadores = sorteo?.ganadores || 1;
    const premio       = sorteo?.premio || 'Premio';

    if (!reaction) {
      await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription('❌ Sorteo terminado sin participantes.')] });
      return;
    }

    const users = await reaction.users.fetch();
    const valid = users.filter(u => !u.bot);

    if (valid.size === 0) {
      await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription('❌ No hubo participantes en el sorteo.')] });
      return;
    }

    // Elegir ganadores aleatorios
    const arr      = [...valid.values()];
    const elegidos = [];
    const cantidad = Math.min(numGanadores, arr.length);

    while (elegidos.length < cantidad) {
      const rand = arr[Math.floor(Math.random() * arr.length)];
      if (!elegidos.find(u => u.id === rand.id)) elegidos.push(rand);
    }

    const mencionados = elegidos.map(u => `<@${u.id}>`).join(', ');

    // Editar el mensaje original
    await msg.edit({
      embeds: [new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle('🎉 SORTEO TERMINADO')
        .setDescription(
          `**Premio:** ${premio}\n\n` +
          `**Ganador${elegidos.length > 1 ? 'es' : ''}:** ${mencionados}\n\n` +
          `_El sorteo ha terminado_`
        )
        .setTimestamp()
      ],
    });

    // Anunciar ganadores
    await channel.send({
      content: mencionados,
      embeds: [new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle('🎊 ¡Tenemos ganador' + (elegidos.length > 1 ? 'es' : '') + '!')
        .setDescription(
          `Felicidades ${mencionados}!\n\n` +
          `**Premio:** ${premio}\n\n` +
          `[Ver sorteo](${msg.url})`
        )
        .setFooter({ text: `${valid.size} participantes` })
        .setTimestamp()
      ],
    });

    sorteos.delete(messageId);
  } catch (err) {
    console.error('Error terminando sorteo:', err.message);
  }
}
