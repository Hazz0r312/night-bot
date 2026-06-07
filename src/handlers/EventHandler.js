const fs   = require('fs');
const path = require('path');

class EventHandler {
  static async load(client) {
    const dir = path.join(__dirname, '..', 'events');
    let count = 0;

    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
      try {
        const ev = require(path.join(dir, file));
        if (ev.once) client.once(ev.name, (...a) => ev.execute(...a, client));
        else         client.on(ev.name,   (...a) => ev.execute(...a, client));
        count++;
      } catch (e) {
        console.error(`❌ Error cargando evento ${file}:`, e.message);
      }
    }
    console.log(`✅ ${count} eventos cargados`);
  }
}

module.exports = EventHandler;
