const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { COLORS, errorEmbed, hasPremium } = require('../../utils/helpers');
const AISystem = require('../../systems/AISystem');

module.exports = {
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('ia')
    .setDescription('🤖 Pregúntale algo a la IA de Night')
    .addSubcommand(s => s.setName('ask')
      .setDescription('Hacer una pregunta a la IA')
      .addStringOption(o => o.setName('pregunta').setDescription('Tu pregunta').setRequired(true).setMaxLength(500)))
    .addSubcommand(s => s.setName('config')
      .setDescription('Admin: Configurar canal de chat IA')
      .addChannelOption(o => o.setName('canal').setDescription('Canal de chat IA (vacío = desactivar)').setRequired(false))),

  async execute(interaction, client, config) {
    const sub = interaction.options.getSubcommand();

    // ── ASK ───────────────────────────────────────────────────────────────────
    if (sub === 'ask') {
      const premium     = await hasPremium(interaction.user.id, interaction.guildId);
      const aiActivated = config?.aiEnabled === true;

      if (!premium && !aiActivated) {
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.gold)
            .setTitle('⭐ Función Premium')
            .setDescription(
              'El comando `/ia ask` requiere **Night Premium** o que un admin active la IA.\n\n' +
              '• `/premium buy` — Comprar premium por $1/mes\n' +
              '• `/ia config #canal` — Admin activa IA para todos'
            )
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const question = interaction.options.getString('pregunta');

      // CRÍTICO: deferReply antes de cualquier operación async
      await interaction.deferReply();

      if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'tu_groq_key_aqui') {
        return interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('❌ IA no configurada')
          .setDescription(
            'La API key de Groq no está configurada.\n\n' +
            '**Pasos:**\n' +
            '1. Ve a **console.groq.com/keys**\n' +
            '2. Crea una cuenta gratis y genera una key\n' +
            '3. Añádela en Render como `GROQ_API_KEY`\n' +
            '4. Reinicia el bot'
          )] });
      }

      try {
        const answer = await AISystem.ask(question, interaction.guild.name, config?.aiPersonality);

        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.main)
            .setAuthor({ name: '🤖 Night IA', iconURL: interaction.client.user.displayAvatarURL() })
            .setDescription(answer.substring(0, 4000))
            .setFooter({ text: 'Powered by Groq · Llama 3.3 70B' })
            .setTimestamp()
          ],
        });

      } catch (err) {
        console.error('IA error:', err.response?.data || err.message);

        if (err.response?.status === 429) {
          return interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(COLORS.warn)
              .setTitle('⚠️ Límite alcanzado')
              .setDescription('Demasiadas peticiones a la IA. Espera unos segundos e inténtalo de nuevo.')
            ],
          });
        }

        if (err.response?.status === 401) {
          return interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(COLORS.error)
              .setTitle('❌ API Key inválida')
              .setDescription('La key de Groq no es válida. Verifica `GROQ_API_KEY` en Render.')
            ],
          });
        }

        return interaction.editReply({ embeds: [errorEmbed(`Error de IA: ${(err.message || 'Desconocido').substring(0, 200)}`)] });
      }
    }

    // ── CONFIG (admin) ────────────────────────────────────────────────────────
    else if (sub === 'config') {
      if (!interaction.member.permissions.has(8n)) {
        return interaction.reply({
          embeds: [errorEmbed('Solo administradores pueden configurar la IA.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const canal = interaction.options.getChannel('canal');
      const { Guild } = require('../../database/models');

      if (canal) {
        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          { aiEnabled: true, aiChannel: canal.id },
          { upsert: true }
        );
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle('🤖 IA Activada')
            .setDescription(`Canal configurado: ${canal}\n\nTodos los usuarios podrán chatear con Night IA sin necesidad de premium.\n\n**Powered by Groq · Llama 3.3**`)
          ],
        });
      } else {
        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          { aiEnabled: false, aiChannel: null },
          { upsert: true }
        );
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription('❌ IA desactivada.')],
        });
      }
    }
  },
};
