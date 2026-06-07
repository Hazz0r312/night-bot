const { EmbedBuilder, Collection } = require('discord.js');
const { User, Guild }  = require('../database/models');
const { xpForLevel, getGuild, hasPremium, errorEmbed } = require('../utils/helpers');

const xpCooldowns = new Map(); 
const XP_CD = 60_000; 

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    const config = await getGuild(message.guild.id);
    const prefix = config?.prefix || '!';

    // ─── EJECUCIÓN DE COMANDOS CLÁSICOS ──────────────────────────────────────────
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();
      
      const command = client.commands.get(commandName);
      
      if (command) {
        // Manejo de Cooldowns básico
        if (!client.cooldowns.has(command.name)) {
          client.cooldowns.set(command.name, new Collection());
        }
        const now = Date.now();
        const timestamps = client.cooldowns.get(command.name);
        const cooldownAmount = (command.cooldown || 3) * 1000;

        if (timestamps.has(message.author.id)) {
          const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
          if (now < expirationTime) {
            const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
            return message.reply(`⏳ Espera **${timeLeft}s** antes de usar \`${command.name}\` otra vez.`);
          }
        }
        timestamps.set(message.author.id, now);
        setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

        try {
          // Ejecuta el comando clásico pasándole message y args
          await command.execute(message, args, client);
        } catch (error) {
          console.error(`Error ejecutando ${command.name}:`, error);
          message.reply({ embeds: [errorEmbed('Hubo un error al ejecutar este comando.')] });
        }
        return; // Detiene aquí para que no ejecute filtros ni de XP en comandos
      }
    }

    // ─── Anti-links ────────────────────────────────────────────────────────────
    if (config?.antiLinks && !message.member?.permissions.has(8n)) {
      const urlRx = /(https?:\/\/|discord\.gg\/|www\.|\.com|\.net|\.org)/i;
      if (urlRx.test(message.content)) {
        await message.delete().catch(() => {});
        const w = await message.channel.send({
          embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`🚫 <@${message.author.id}> Los enlaces no están permitidos aquí.`)]
        });
        setTimeout(() => w.delete().catch(() => {}), 5000);
        return;
      }
    }

    // ─── Anti-invites ──────────────────────────────────────────────────────────
    if (config?.antiInvites && !message.member?.permissions.has(8n)) {
      if (/discord\.(gg|com\/invite)\//i.test(message.content)) {
        await message.delete().catch(() => {});
        message.channel.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`🚫 <@${message.author.id}> Las invitaciones no están permitidas.`)] })
          .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
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

    // ─── IA Chat ───────────────────────────────────────────────────────────────
    if (config?.aiEnabled && config.aiChannel && message.channelId === config.aiChannel) {
      if (message.content.length < 2) return;
      try {
        const AISystem = require('../systems/AISystem');
        await AISystem.respond(message, config);
      } catch (e) {
        console.error('AI error:', e.message);
      }
      return;
    }

    // ─── Sistema XP ────────────────────────────────────────────────────────────
    if (!config?.levelsEnabled) return;

    const cdKey = `${message.author.id}:${message.guild.id}`;
    const last  = xpCooldowns.get(cdKey) || 0;
    if (Date.now() - last < XP_CD) return;
    xpCooldowns.set(cdKey, Date.now());

    let xpGain = Math.floor(Math.random() * 25) + 15;

    let userDoc = await User.findOneAndUpdate(
      { userId: message.author.id, guildId: message.guild.id },
      { $inc: { xp: xpGain } },
      { upsert: true, new: true }
    );

    // Función simulada para calcular XP requerida si no existe la importación
    const needed = (100 * (userDoc.level || 1)); 
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
        const defaultLvlMsg = `✨ ¡Enhorabuena {user}! Has subido al **nivel {level}** 🎉`;
        const lvlMsg = (config.levelMessage || defaultLvlMsg)
          .replace('{user}', `<@${message.author.id}>`)
          .replace('{level}', userDoc.level)
          .replace('{username}', message.author.username);

        targetChannel.send({ embeds: [new EmbedBuilder()
          .setColor(0xF5C842)
          .setDescription(lvlMsg)
          .setThumbnail(message.author.displayAvatarURL())
          .setTimestamp()]
        }).catch(() => {});
      }
    }
  },
};