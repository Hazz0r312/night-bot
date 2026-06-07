const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { COLORS, errorEmbed, hasPremium } = require('../../utils/helpers');
const AISystem = require('../../systems/AISystem');

module.exports = {
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('ia')
    .setDescription('🤖 Pregúntale algo a la IA de Night')
    .addSubcommand(s => s.setName('ask').setDescription('Hacer una pregunta a la IA')
      .addStringOption(o => o.setName('pregunta').setDescription('Tu pregunta').setRequired(true)))
    .addSubcommand(s => s.setName('config').setDescription('Admin: Configurar canal de chat IA')
      .addChannelOption(o => o.setName('canal').setDescription('Canal de chat IA (vacío = desactivar)').setRequired(false))),

  async execute(interaction, client, config) {
    const sub = interaction.options.getSubcommand();

    // ── ASK ───────────────────────────────────────────────────────────────────
    if (sub === 'ask') {

      // Comprobar premium — el usuario tiene premium O el servidor tiene IA activada
      const premium = await hasPremium(interaction.user.id, interaction.guildId);
      const aiActivated = config?.aiEnabled === true;

      if (!premium && !aiActivated) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.gold)
            .setTitle('⭐ Función Premium')
            .setDescription(
              'El comando `/ia ask` requiere **Night Premium** o que un administrador active la IA en el servidor.\n\n' +
              '**¿Cómo activarlo?**\n' +
              '• `/premium buy` — Compra premium por $1/mes\n' +
              '• `/ia config #canal` — Admin activa IA para todos'
            )
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const question = interaction.options.getString('pregunta');
      await interaction.deferReply();

      try {
        const answer = await AISystem.ask(question, interaction.guild.name);
        const embed  = new EmbedBuilder()
          .setColor(COLORS.main)
          .setAuthor({ name: '🤖 Night IA', iconURL: interaction.client.user.displayAvatarURL() })
          .setDescription(answer.substring(0, 4000))
          .setFooter({ text: 'Powered by Google Gemini • /ia ask' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply({ embeds: [errorEmbed(`Error de IA: ${err.message}`)] });
      }
    }

    // ── CONFIG ────────────────────────────────────────────────────────────────
    else if (sub === 'config') {
      if (!interaction.member.permissions.has(8n))
        return interaction.reply({ embeds: [errorEmbed('Solo administradores pueden configurar la IA.')], flags: MessageFlags.Ephemeral });

      const canal = interaction.options.getChannel('canal');
      const { Guild } = require('../../database/models');

      if (canal) {
        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          { aiEnabled: true, aiChannel: canal.id },
          { upsert: true }
        );
        interaction.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle('🤖 IA Activada')
          .setDescription(`Canal de IA configurado: ${canal}\n\nTodos los usuarios podrán chatear con Night IA en ese canal sin necesidad de premium.`)]
        });
      } else {
        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          { aiEnabled: false, aiChannel: null },
          { upsert: true }
        );
        interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription('❌ IA desactivada en este servidor.')] });
      }
    }
  },
};
