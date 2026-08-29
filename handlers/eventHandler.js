const fs = require('node:fs');
const path = require('node:path');

module.exports = async function loadEvents(client) {
  const dir = path.join(__dirname, '..', 'events');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const event = require(path.join(dir, file));
    if (!event?.name) continue;
    if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
    else            client.on  (event.name, (...args) => event.execute(...args, client));
  }
  console.log(`[EVT] Loaded ${files.length} events.`);
};
