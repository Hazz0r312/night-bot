require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const commands = [];
const dir = path.join(__dirname, 'commands');

for (const cat of fs.readdirSync(dir)) {
  const catPath = path.join(dir, cat);
  if (!fs.statSync(catPath).isDirectory()) continue;
  for (const file of fs.readdirSync(catPath).filter(f => f.endsWith('.js'))) {
    try {
      const cmd = require(path.join(catPath, file));
      if (cmd?.data?.toJSON) {
        commands.push(cmd.data.toJSON());
        console.log(`  ✅ /${cmd.data.name}`);
      }
    } catch (e) {
      console.error(`  ❌ ${file}:`, e.message);
    }
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  console.log(`\n🔄 Registrando ${commands.length} slash commands...\n`);
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log('\n✅ Slash commands registrados. Aparecen en Discord en segundos.\n');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
})();
