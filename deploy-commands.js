require('dotenv').config();
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const loadCommands = require('./handlers/commandHandler');
const registerSlash = require('./handlers/slashRegister');

(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.commands = new Collection();
  client.prefixCommands = new Collection();
  client.aliases = new Collection();
  await loadCommands(client);
  await registerSlash(client);
  process.exit(0);
})();
