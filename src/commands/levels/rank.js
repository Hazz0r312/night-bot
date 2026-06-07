const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { User } = require('../../database/models');
const { COLORS, xpForLevel, progressBar, errorEmbed, hasPremium } = require('../../utils/helpers');

module.exports = {
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('niveles')
    .setDescription('⭐ Sistema de niveles')
    .addSubcommand(s => s.setName('rank').setDescription('Ver tu nivel actual')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(false)))
    .addSubcommand(s => s.setName('top').setDescription('🏆 Ranking de niveles del servidor'))
    .addSubcommand(s => s.setName('setxp').setDescription('Admin: Dar XP a un usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .addIntegerOption(o => o.setName('cantidad').setDescription('XP a dar').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── RANK ──────────────────────────────────────────────────────────────────
    if (sub === 'rank') {
      const target = interaction.options.getUser('usuario') ?? interaction.user;
      let u = await User.findOne({ userId: target.id, guildId: interaction.guildId });
      if (!u) u = await User.create({ userId: target.id, guildId: interaction.guildId });

      const needed   = xpForLevel(u.level);
      const bar      = progressBar(u.xp, needed, 18);
      const percent  = Math.floor((u.xp / needed) * 100);
      const premium  = await hasPremium(target.id, interaction.guildId);

      const rank = await User.countDocuments({
        guildId: interaction.guildId,
        $or: [{ level: { $gt: u.level } }, { level: u.level, xp: { $gt: u.xp } }],
      });

      interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(premium ? COLORS.gold : COLORS.main)
        .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
        .setTitle(`⭐ Nivel ${u.level}`)
        .setDescription(`\`${bar}\` **${percent}%**\n${u.xp} / ${needed} XP`)
        .addFields(
          { name: '🏅 Posición', value: `#${rank + 1}`, inline: true },
          { name: '📊 Nivel',    value: `${u.level}`,   inline: true },
          { name: '✨ XP',       value: `${u.xp}`,       inline: true },
        )
        .setFooter({ text: premium ? '⭐ Premium — XP ×2' : `Siguiente nivel: ${needed - u.xp} XP` })
        .setTimestamp()] });
    }

    // ── TOP ───────────────────────────────────────────────────────────────────
    else if (sub === 'top') {
      const users = await User.find({ guildId: interaction.guildId }).sort({ level: -1, xp: -1 }).limit(10);
      if (!users.length) return interaction.reply({ embeds: [errorEmbed('Nadie tiene XP aún.')], ephemeral: true });

      const medals = ['🥇', '🥈', '🥉'];
      const list   = users.map((u, i) => `${medals[i] || `**${i+1}.**`} <@${u.userId}> — Nv.**${u.level}** (${u.xp} XP)`).join('\n');

      interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle(`🏆 Ranking de Niveles — ${interaction.guild.name}`)
        .setDescription(list)
        .setTimestamp()] });
    }

    // ── SETXP ─────────────────────────────────────────────────────────────────
    else if (sub === 'setxp') {
      if (!interaction.member.permissions.has(8n))
        return interaction.reply({ content: '❌ Solo administradores.', ephemeral: true });
      const target = interaction.options.getUser('usuario');
      const xp     = interaction.options.getInteger('cantidad');
      await User.findOneAndUpdate({ userId: target.id, guildId: interaction.guildId }, { $inc: { xp } }, { upsert: true });
      interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(`✅ Añadido **${xp} XP** a <@${target.id}>`)] });
    }
  },
};