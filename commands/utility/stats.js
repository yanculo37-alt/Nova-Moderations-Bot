const { SlashCommandBuilder, version } = require('discord.js');
const embeds = require('../../embeds');
const os = require('os');
const { v2 } = require('../../utils/v2');

function build(client) {
  return embeds.info('Bot Stats')
    .addFields(
      { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
      { name: 'Users', value: `${client.users.cache.size}`, inline: true },
      { name: 'Uptime', value: `<t:${Math.floor((Date.now() - client.uptime)/1000)}:R>`, inline: true },
      { name: 'Memory', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`, inline: true },
      { name: 'Node', value: process.version, inline: true },
      { name: 'discord.js', value: `v${version}`, inline: true },
      { name: 'Platform', value: `${os.platform()} ${os.arch()}`, inline: true },
    );
}

module.exports = {
  name: 'stats',
  aliases: ['botinfo'],
  description: 'Show bot statistics.',
  category: 'utility',
  data: new SlashCommandBuilder().setName('stats').setDescription('Bot stats.'),
  run: ({ message, client }) => message.reply(v2([build(client)])),
  execute: ({ interaction, client }) => interaction.reply(v2([build(client)])),
};
