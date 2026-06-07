const fs = require('fs');
const path = require('path');

module.exports = {
  async load(client) {
    const commandsPath = path.join(__dirname, '../commands');
    if (!fs.existsSync(commandsPath)) {
      console.log('❌ [CommandHandler] No se encontró la carpeta de comandos.');
      return;
    }

    // Limpiamos la colección antes de cargar
    client.commands.clear();
    let count = 0;

    const categories = fs.readdirSync(commandsPath);
    for (const category of categories) {
      const catPath = path.join(commandsPath, category);
      
      if (fs.statSync(catPath).isDirectory()) {
        const files = fs.readdirSync(catPath).filter(f => f.endsWith('.js'));
        for (const file of files) {
          try {
            const filePath = path.join(catPath, file);
            
            // Forzar limpieza de caché para cargar la última versión del archivo
            delete require.cache[require.resolve(filePath)];
            const command = require(filePath);
            
            const name = command.data?.name || command.name;
            if (name) {
              client.commands.set(name, command);
              count++;
            }
          } catch (error) {
            console.error(`❌ Error cargando comando [${file}] en carpeta [${category}]:`, error.message);
          }
        }
      } else if (category.endsWith('.js')) {
        try {
          delete require.cache[require.resolve(catPath)];
          const command = require(catPath);
          const name = command.data?.name || command.name;
          if (name) {
            client.commands.set(name, command);
            count++;
          }
        } catch (error) {
          console.error(`❌ Error cargando comando suelto [${category}]:`, error.message);
        }
      }
    }
    
    console.log(`✅ [CommandHandler] Se cargaron correctamente ${count} comandos en la memoria del bot.`);
  }
};