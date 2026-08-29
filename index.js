require('dotenv').config();
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const mongoose = require('mongoose');
const { connectDB } = require('./handlers/database');
const loadCommands = require('./handlers/commandHandler');
const loadEvents = require('./handlers/eventHandler');
const registerSlash = require('./handlers/slashRegister');

mongoose.set('bufferCommands', false);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember, Partials.User],
});

client.commands = new Collection();
client.prefixCommands = new Collection();
client.aliases = new Collection();
client.cooldowns = new Collection();
client.snipes = new Collection();
client.afk = new Collection();
client.spamMap = new Collection();
client.warnRepeats = new Collection();
client.config = require('./configs/config.json');

(async () => {
  try {
    await loadCommands(client);
    await loadEvents(client);

    await registerSlash(client);

    connectDB().catch(err => console.error('[DB] background connect failed:', err.message));

    await client.login(process.env.TOKEN);

    require('./realms/account').ensureBotAccount()
      .catch(err => console.error('[REALM] account setup failed:', err?.message || err));
  } catch (err) {
    console.error('[FATAL]', err);
    process.exit(1);
  }
})();

process.on('unhandledRejection', e => console.error('[unhandledRejection]', e));
process.on('uncaughtException',  e => console.error('[uncaughtException]', e));

module.exports = client;
