require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const { connectDB }  = require('./database/connection');
const CommandHandler = require('./handlers/CommandHandler');
const EventHandler   = require('./handlers/EventHandler');
const WebServer      = require('./systems/WebServer');

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

  await connectDB();
  await CommandHandler.load(client);
  await EventHandler.load(client);

  // Iniciar servidor web con todas las rutas (PayPal, dashboard, health)
  WebServer.start(client);

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(err => {
  console.error('❌ Error fatal al iniciar:', err);
  process.exit(1);
});
