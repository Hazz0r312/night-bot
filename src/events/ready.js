const { ActivityType } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`\n✅ Night Bot online como: ${client.user.tag}`);
    console.log(`📡 Servidores: ${client.guilds.cache.size}`);
    console.log(`👥 Usuarios: ${client.users.cache.size}\n`);

    const acts = [
      { name: '/help | nightbot.app',       type: ActivityType.Playing },
      { name: `${client.guilds.cache.size} servidores 🌙`, type: ActivityType.Watching },
      { name: 'comunidades crecer ⭐',       type: ActivityType.Watching },
      { name: 'Premium por $1/mes 💎',       type: ActivityType.Playing },
    ];
    let i = 0;
    client.user.setActivity(acts[0].name, { type: acts[0].type });
    setInterval(() => {
      i = (i + 1) % acts.length;
      client.user.setActivity(acts[i].name, { type: acts[i].type });
    }, 20_000);
  },
};