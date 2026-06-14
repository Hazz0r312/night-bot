const { EmbedBuilder } = require('discord.js');
const { User, Guild }  = require('../database/models');
const { xpForLevel, getGuild, hasPremium } = require('../utils/helpers');

const xpCooldowns = new Map();
const XP_CD = 60_000;

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    // Obtener config del servidor
    let config;
    try {
      config = await getGuild(message.guild.id);
    } catch { return; }

    // ─── Anti-links ────────────────────────────────────────────────────────────
    if (config?.antiLinks && !message.member?.permissions.has(8n)) {
      const urlRx = /(https?:\/\/|discord\.gg\/|www\.|\.com|\.net|\.org)/i;
      if (urlRx.test(message.content)) {
        await message.delete().catch(() => {});
        const w = await message.channel.send({
          embeds: [new EmbedBuilder().setColor(0xED4245)
            .setDescription(`🚫 <@${message.author.id}> Los enlaces no están permitidos aquí.`)]
        });
        setTimeout(() => w.delete().catch(() => {}), 5000);
        return;
      }
    }

    // ─── Anti-invites ──────────────────────────────────────────────────────────
    if (config?.antiInvites && !message.member?.permissions.has(8n)) {
      if (/discord\.(gg|com\/invite)\//i.test(message.content)) {
        await message.delete().catch(() => {});
        const w = await message.channel.send({
          embeds: [new EmbedBuilder().setColor(0xED4245)
            .setDescription(`🚫 <@${message.author.id}> Las invitaciones no están permitidas.`)]
        });
        setTimeout(() => w.delete().catch(() => {}), 5000);
        return;
      }
    }

    // ─── Palabras prohibidas ───────────────────────────────────────────────────
    if (config?.bannedWords?.length && !message.member?.permissions.has(8n)) {
      const lower = message.content.toLowerCase();
      if (config.bannedWords.some(w => lower.includes(w.toLowerCase()))) {
        await message.delete().catch(() => {});
        return;
      }
    }

    // ─── Canal de IA (Premium) ────────────────────────────────────────────────
    // Si el mensaje es en el canal de IA configurado, responde automáticamente
    if (
      config?.aiEnabled &&
      config?.aiChannel &&
      message.channelId === config.aiChannel &&
      message.content.length > 1
    ) {
      // Verificar premium del servidor o del usuario
      const premium = await hasPremium(message.author.id, message.guild.id);
      if (!premium) {
        // Solo avisar una vez, no en cada mensaje
        const key = `ai_warn:${message.guild.id}`;
        if (!xpCooldowns.has(key)) {
          xpCooldowns.set(key, Date.now());
          setTimeout(() => xpCooldowns.delete(key), 60_000 * 10);
          message.channel.send({
            embeds: [new EmbedBuilder()
              .setColor(0xF0C040)
              .setDescription('⭐ El canal de IA requiere **Night Premium**. Usa `/premium buy` para activarlo.')
            ]
          }).catch(() => {});
        }
        // Igual procesar XP aunque no tenga premium
      } else {
        // Responder con IA (Groq)
        try {
          if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'tu_groq_key_aqui') {
            return;
          }
          const AISystem = require('../systems/AISystem');
          await AISystem.respond(message, config);
        } catch (err) {
          console.error('AI canal error:', err.message);
          if (!err.message?.includes('429')) {
            message.react('❌').catch(() => {});
          }
        }
        return; // No dar XP en canal de IA
      }
    }

    // ─── Mención al bot (Premium) ─────────────────────────────────────────────
    // Si tagean a Night directamente, responde con IA solo si tiene premium
    if (message.mentions.has(client.user.id) && !message.mentions.everyone) {
      const premium = await hasPremium(message.author.id, message.guild.id);

      // Limpiar la mención del contenido
      const content = message.content
        .replace(/<@!?\d+>/g, '')
        .trim();

      if (content.length > 1) {
        if (!premium) {
          message.reply({
            embeds: [new EmbedBuilder()
              .setColor(0xF0C040)
              .setTitle('⭐ Función Premium')
              .setDescription(
                '¡Hola! 👋 Para que pueda responderte cuando me mencionas necesitas **Night Premium**.\n\n' +
                '• `/premium buy` — Activa premium por $1/mes\n' +
                '• `/ia ask` — También puedes preguntarme con este comando (requiere premium o canal de IA)'
              )
            ]
          }).catch(() => {});
          return;
        }

        // Tiene premium → responder con IA
        if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'tu_groq_key_aqui') return;

        try {
          message.channel.sendTyping().catch(() => {});
          const AISystem = require('../systems/AISystem');
          const answer = await AISystem.ask(content, message.guild.name, config?.aiPersonality);

          if (answer.length > 1900) {
            await message.reply({ embeds: [new EmbedBuilder()
              .setColor(0x5865F2)
              .setAuthor({ name: '🤖 Night IA', iconURL: client.user.displayAvatarURL() })
              .setDescription(answer.substring(0, 4000))
              .setFooter({ text: 'Powered by Groq · Llama 3.3' })]
            });
          } else {
            await message.reply(answer);
          }
        } catch (err) {
          console.error('AI mention error:', err.response?.data || err.message);
          if (err.response?.status === 429) {
            message.reply('⚠️ Límite de IA alcanzado, intenta en unos segundos.').catch(() => {});
          }
        }
        return;
      }
    }

    // ─── Sistema XP ────────────────────────────────────────────────────────────
    if (!config?.levelsEnabled) return;

    const cdKey = `${message.author.id}:${message.guild.id}`;
    const last  = xpCooldowns.get(cdKey) || 0;
    if (Date.now() - last < XP_CD) return;
    xpCooldowns.set(cdKey, Date.now());

    let premium;
    try {
      premium = await hasPremium(message.author.id, message.guild.id);
    } catch { premium = false; }

    const xpGain = premium
      ? Math.floor(Math.random() * 40) + 30
      : Math.floor(Math.random() * 25) + 15;

    let userDoc;
    try {
      userDoc = await User.findOneAndUpdate(
        { userId: message.author.id, guildId: message.guild.id },
        { $inc: { xp: xpGain } },
        { upsert: true, new: true }
      );
    } catch { return; }

    // Comprobar subida de nivel
    const needed = xpForLevel(userDoc.level);
    if (userDoc.xp >= needed) {
      userDoc = await User.findOneAndUpdate(
        { userId: message.author.id, guildId: message.guild.id },
        { $inc: { level: 1 }, $set: { xp: 0 } },
        { new: true }
      );

      const targetChannel = config?.levelChannel
        ? message.guild.channels.cache.get(config.levelChannel)
        : message.channel;

      if (targetChannel) {
        const lvlMsg = (config.levelMessage || '🎉 ¡{user} ha subido al nivel **{level}**!')
          .replace('{user}',     `<@${message.author.id}>`)
          .replace('{level}',    userDoc.level)
          .replace('{username}', message.author.username);

        targetChannel.send({ embeds: [new EmbedBuilder()
          .setColor(0xF5C842)
          .setDescription(lvlMsg)
          .setTimestamp()]
        }).catch(() => {});
      }

      // Rol de recompensa
      if (config?.levelRoles?.length) {
        const reward = config.levelRoles.find(r => r.level === userDoc.level);
        if (reward) {
          const role = message.guild.roles.cache.get(reward.roleId);
          if (role) message.member.roles.add(role).catch(() => {});
        }
      }
    }
  },
};
