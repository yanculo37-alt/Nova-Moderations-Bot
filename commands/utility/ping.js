const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'ping',
  description: 'Check bot latency.',
  category: 'utility',
  data: new SlashCommandBuilder().setName('ping').setDescription('Check latency.'),
  run({ message, client }) {
    message.reply(v2([embeds.info('Pong', `**WS:** ${client.ws.ping}ms`)]));
  },
  execute({ interaction, client }) {
    interaction.reply(v2([embeds.info('Pong', `**WS:** ${client.ws.ping}ms`)]));
  },
};
