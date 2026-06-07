const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, COLORS, errorEmbed, successEmbed, fmt, hasPremium } = require('../../utils/helpers');
const { User } = require('../../database/models');

const JOBS = [
  'repartiste pizzas 🍕', 'paseaste perros 🐕', 'limpiaste ventanas 🪟',
  'programaste una app 💻', 'diseñaste logos 🎨', 'diste clases particulares 📚',
  'vendiste helados 🍦', 'arreglaste ordenadores 🖥️', 'escribiste artículos ✍️',
  'cuidaste niños 👶', 'condujiste para Uber 🚗', 'hiciste de DJ en una fiesta 🎧',
];

const CRIMES = [
  'robaste una tienda 🏪', 'hackeaste una web 💻', 'vendiste objetos falsos 🛍️',
  'timaste a un turista 🗺️', 'robaste en un mercado 🛒',
];

const EPH = { flags: MessageFlags.Ephemeral };

module.exports = {
  cooldown: 3,
  data: new SlashCommandBuilder()
    .setName('economia')
    .setDescription('💰 Comandos de economía')
    .addSubcommand(s => s.setName('balance').setDescription('Ver tu saldo')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(false)))
    .addSubcommand(s => s.setName('daily').setDescription('🎁 Recompensa diaria'))
    .addSubcommand(s => s.setName('work').setDescription('💼 Trabajar (cooldown: 1h)'))
    .addSubcommand(s => s.setName('crime').setDescription('🦹 Cometer un crimen (cooldown: 2h)'))
    .addSubcommand(s => s.setName('rob').setDescription('🔫 Robar a un usuario')
      .addUserOption(o => o.setName('usuario').setDescription('Víctima').setRequired(true)))
    .addSubcommand(s => s.setName('pay').setDescription('💸 Enviar monedas')
      .addUserOption(o => o.setName('usuario').setDescription('Destinatario').setRequired(true))
      .addIntegerOption(o => o.setName('cantidad').setDescription('Cantidad').setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName('depositar').setDescription('🏦 Depositar en el banco')
      .addIntegerOption(o => o.setName('cantidad').setDescription('Cantidad').setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName('retirar').setDescription('🏦 Retirar del banco')
      .addIntegerOption(o => o.setName('cantidad').setDescription('Cantidad').setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName('top').setDescription('🏆 Ranking de riqueza')),

  async execute(interaction, client, config) {
    const sub      = interaction.options.getSubcommand();
    const emoji    = config?.currencyEmoji || '🪙';
    const currency = config?.currencyName  || 'coins';
    const premium  = await hasPremium(interaction.user.id, interaction.guildId);

    // ── BALANCE ────────────────────────────────────────────────────────────────
    if (sub === 'balance') {
      const target = interaction.options.getUser('usuario') ?? interaction.user;
      const u      = await getUser(target.id, interaction.guildId);
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.gold)
        .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
        .setTitle(`${emoji} Balance de ${target.username}`)
        .addFields(
          { name: 'En mano',  value: `${emoji} **${fmt(u.coins)}** ${currency}`,         inline: true },
          { name: 'En banco', value: `${emoji} **${fmt(u.bank)}** ${currency}`,           inline: true },
          { name: 'Total',    value: `${emoji} **${fmt(u.coins + u.bank)}** ${currency}`, inline: true },
        )
        .setFooter({ text: premium ? '⭐ Usuario Premium' : 'Night Bot • Economía' })
        .setTimestamp()] });
    }

    // ── DAILY ──────────────────────────────────────────────────────────────────
    if (sub === 'daily') {
      const u  = await getUser(interaction.user.id, interaction.guildId);
      const cd = 24 * 60 * 60 * 1000;
      if (u.lastDaily && Date.now() - u.lastDaily.getTime() < cd) {
        const rem = u.lastDaily.getTime() + cd;
        return interaction.reply({ embeds: [errorEmbed(`Ya recogiste tu daily. Vuelve <t:${Math.floor(rem / 1000)}:R>`)], ...EPH });
      }
      const reward = premium ? 1000 : 500;
      await User.updateOne(
        { userId: interaction.user.id, guildId: interaction.guildId },
        { $inc: { coins: reward }, $set: { lastDaily: new Date() } }
      );
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.success)
        .setDescription(`🎁 Recibiste **${emoji} ${fmt(reward)} ${currency}**!${premium ? '\n⭐ **Bonus Premium ×2**' : ''}`)
        .setTimestamp()] });
    }

    // ── WORK ───────────────────────────────────────────────────────────────────
    if (sub === 'work') {
      const u  = await getUser(interaction.user.id, interaction.guildId);
      const cd = 60 * 60 * 1000;
      if (u.lastWork && Date.now() - u.lastWork.getTime() < cd) {
        const rem = u.lastWork.getTime() + cd;
        return interaction.reply({ embeds: [errorEmbed(`Ya trabajaste. Descansa hasta <t:${Math.floor(rem / 1000)}:R>`)], ...EPH });
      }
      const base   = premium ? 500 : 250;
      const earned = Math.floor(Math.random() * base) + (premium ? 200 : 100);
      const job    = JOBS[Math.floor(Math.random() * JOBS.length)];
      await User.updateOne(
        { userId: interaction.user.id, guildId: interaction.guildId },
        { $inc: { coins: earned }, $set: { lastWork: new Date() } }
      );
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.success)
        .setDescription(`💼 Hoy **${job}** y ganaste **${emoji} ${fmt(earned)} ${currency}**!${premium ? '\n⭐ Salario Premium' : ''}`)
        .setTimestamp()] });
    }

    // ── CRIME ──────────────────────────────────────────────────────────────────
    if (sub === 'crime') {
      const u  = await getUser(interaction.user.id, interaction.guildId);
      const cd = 2 * 60 * 60 * 1000;
      if (u.lastCrime && Date.now() - u.lastCrime.getTime() < cd) {
        const rem = u.lastCrime.getTime() + cd;
        return interaction.reply({ embeds: [errorEmbed(`Estás siendo buscado. Espera hasta <t:${Math.floor(rem / 1000)}:R>`)], ...EPH });
      }
      await User.updateOne({ userId: interaction.user.id, guildId: interaction.guildId }, { $set: { lastCrime: new Date() } });
      const crime = CRIMES[Math.floor(Math.random() * CRIMES.length)];
      if (Math.random() < 0.55) {
        const earned = Math.floor(Math.random() * 800) + 300;
        await User.updateOne({ userId: interaction.user.id, guildId: interaction.guildId }, { $inc: { coins: earned } });
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.purple)
          .setDescription(`🦹 **${crime}** y saliste con **${emoji} ${fmt(earned)} ${currency}**. ¡Increíble!`)
          .setTimestamp()] });
      } else {
        const fine = Math.min(u.coins, Math.floor(Math.random() * 400) + 100);
        if (fine > 0) await User.updateOne({ userId: interaction.user.id, guildId: interaction.guildId }, { $inc: { coins: -fine } });
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.error)
          .setDescription(`🚔 Intentaste **${crime}** pero te pillaron. Multa: **${emoji} ${fmt(fine)} ${currency}**`)
          .setTimestamp()] });
      }
    }

    // ── ROB ────────────────────────────────────────────────────────────────────
    if (sub === 'rob') {
      const target = interaction.options.getUser('usuario');
      if (target.bot || target.id === interaction.user.id)
        return interaction.reply({ embeds: [errorEmbed('Víctima inválida.')], ...EPH });
      const u  = await getUser(interaction.user.id, interaction.guildId);
      const cd = 2 * 60 * 60 * 1000;
      if (u.lastRob && Date.now() - u.lastRob.getTime() < cd) {
        const rem = u.lastRob.getTime() + cd;
        return interaction.reply({ embeds: [errorEmbed(`Demasiado arriesgado. Espera <t:${Math.floor(rem / 1000)}:R>`)], ...EPH });
      }
      const victim = await getUser(target.id, interaction.guildId);
      if (victim.coins < 100)
        return interaction.reply({ embeds: [errorEmbed('La víctima no tiene suficientes monedas.')], ...EPH });
      await User.updateOne({ userId: interaction.user.id, guildId: interaction.guildId }, { $set: { lastRob: new Date() } });
      if (Math.random() < 0.45) {
        const stolen = Math.floor(victim.coins * (Math.random() * 0.3 + 0.1));
        await User.updateOne({ userId: target.id, guildId: interaction.guildId }, { $inc: { coins: -stolen } });
        await User.updateOne({ userId: interaction.user.id, guildId: interaction.guildId }, { $inc: { coins: stolen } });
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.purple)
          .setDescription(`🔫 Robaste **${emoji} ${fmt(stolen)} ${currency}** a <@${target.id}>!`)
          .setTimestamp()] });
      } else {
        const fine = Math.min(u.coins, Math.floor(Math.random() * 300) + 100);
        if (fine > 0) await User.updateOne({ userId: interaction.user.id, guildId: interaction.guildId }, { $inc: { coins: -fine } });
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.error)
          .setDescription(`🚔 Te pillaron robando a <@${target.id}>. Multa: **${emoji} ${fmt(fine)} ${currency}**`)
          .setTimestamp()] });
      }
    }

    // ── PAY ────────────────────────────────────────────────────────────────────
    if (sub === 'pay') {
      const target = interaction.options.getUser('usuario');
      const amount = interaction.options.getInteger('cantidad');
      if (target.bot || target.id === interaction.user.id)
        return interaction.reply({ embeds: [errorEmbed('Destinatario inválido.')], ...EPH });
      const u = await getUser(interaction.user.id, interaction.guildId);
      if (u.coins < amount)
        return interaction.reply({ embeds: [errorEmbed(`No tienes suficientes monedas. Tienes **${fmt(u.coins)} ${currency}**.`)], ...EPH });
      await User.updateOne({ userId: interaction.user.id, guildId: interaction.guildId }, { $inc: { coins: -amount } });
      await User.findOneAndUpdate({ userId: target.id, guildId: interaction.guildId }, { $inc: { coins: amount } }, { upsert: true });
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success)
        .setDescription(`💸 <@${interaction.user.id}> envió **${emoji} ${fmt(amount)} ${currency}** a <@${target.id}>`)
        .setTimestamp()] });
    }

    // ── DEPOSITAR ──────────────────────────────────────────────────────────────
    if (sub === 'depositar') {
      const amount = interaction.options.getInteger('cantidad');
      const u = await getUser(interaction.user.id, interaction.guildId);
      if (u.coins < amount)
        return interaction.reply({ embeds: [errorEmbed(`Solo tienes **${fmt(u.coins)} ${currency}** en mano.`)], ...EPH });
      await User.updateOne({ userId: interaction.user.id, guildId: interaction.guildId }, { $inc: { coins: -amount, bank: amount } });
      return interaction.reply({ embeds: [successEmbed(`Depositaste **${emoji} ${fmt(amount)} ${currency}** en el banco.`)] });
    }

    // ── RETIRAR ────────────────────────────────────────────────────────────────
    if (sub === 'retirar') {
      const amount = interaction.options.getInteger('cantidad');
      const u = await getUser(interaction.user.id, interaction.guildId);
      if (u.bank < amount)
        return interaction.reply({ embeds: [errorEmbed(`Solo tienes **${fmt(u.bank)} ${currency}** en el banco.`)], ...EPH });
      await User.updateOne({ userId: interaction.user.id, guildId: interaction.guildId }, { $inc: { coins: amount, bank: -amount } });
      return interaction.reply({ embeds: [successEmbed(`Retiraste **${emoji} ${fmt(amount)} ${currency}** del banco.`)] });
    }

    // ── TOP ────────────────────────────────────────────────────────────────────
    if (sub === 'top') {
      const users = await User.find({ guildId: interaction.guildId }).sort({ coins: -1 }).limit(10);
      if (!users.length)
        return interaction.reply({ embeds: [errorEmbed('No hay datos aún.')], ...EPH });
      const medals = ['🥇', '🥈', '🥉'];
      const list   = users.map((u, i) =>
        `${medals[i] || `**${i + 1}.**`} <@${u.userId}> — ${emoji} **${fmt(u.coins + u.bank)}**`
      ).join('\n');
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle(`🏆 Top Riqueza — ${interaction.guild.name}`)
        .setDescription(list)
        .setTimestamp()] });
    }
  },
};
