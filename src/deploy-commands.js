require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

// 1. Leemos todas las subcarpetas de comandos
if (fs.existsSync(commandsPath)) {
  for (const category of fs.readdirSync(commandsPath)) {
    const catPath = path.join(commandsPath, category);
    if (!fs.statSync(catPath).isDirectory()) continue;
    
    for (const file of fs.readdirSync(catPath).filter(f => f.endsWith('.js'))) {
      try {
        const cmd = require(path.join(catPath, file));
        
        if (Array.isArray(cmd)) {
          cmd.forEach(c => c.data && commands.push(c.data.toJSON()));
        } else if (cmd && cmd.data) {
          commands.push(cmd.data.toJSON());
        }
      } catch (error) {
        console.error(`❌ Error al leer el archivo ${file}:`, error.message);
      }
    }
  }
}

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error('❌ Falta DISCORD_TOKEN o CLIENT_ID en el archivo .env');
  process.exit(1);
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    // 🆔 REEMPLAZA ESTOS NÚMEROS POR LA ID DE TU SERVIDOR DE PRUEBAS
    const GUILD_ID = '1510756388635279492'; 

    console.log(`🔄 Registrando ${commands.length} slash commands en el servidor...`);
    
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD_ID),
      { body: commands },
    );
    
    console.log('🚀 ¡LISTO! Todos los comandos han sido impactados en tu servidor.');
  } catch (err) {
    console.error('❌ Error al enviar los comandos a Discord:', err.message);
  }
})();