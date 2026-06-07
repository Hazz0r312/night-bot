require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const { connectDB }  = require('./database/connection');
const CommandHandler = require('./handlers/CommandHandler');
const EventHandler   = require('./handlers/EventHandler');
const express        = require('express');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [
    Partials.Message, Partials.Channel,
    Partials.Reaction, Partials.GuildMember, Partials.User,
  ],
});

client.commands  = new Collection();
client.cooldowns = new Collection();
client.queues    = new Map();

async function main() {
  console.log('\n🌙 [Arranque] Iniciando Night Bot v2...\n');

  // Servidor web — necesario para que Render no apague el servicio
  const app  = express();
  const PORT = process.env.PORT || 3000;

  app.get('/', (req, res) => res.json({
    status: 'online',
    bot:    client.user?.tag || 'iniciando...',
    guilds: client.guilds.cache.size,
  }));

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.listen(PORT, () => {
    console.log(`✅ Servidor web escuchando en puerto ${PORT}`);
  });

  // Base de datos
  await connectDB();

  // Comandos y eventos
  await CommandHandler.load(client);
  await EventHandler.load(client);

  // Login Discord
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(err => {
  console.error('❌ Error fatal al iniciar:', err);
  process.exit(1);
});
