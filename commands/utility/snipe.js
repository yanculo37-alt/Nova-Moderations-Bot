const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'snipe',
  description: 'Show the last deleted message.',
  category: 'utility',
  data: new SlashCommandBuilder().setName('snipe').setDescription('Show last deleted message.'),
  run({ message, client }) {
    const s = client.snipes.get(message.channel.id);
    if (!s) return message.reply(v2([embeds.warn('Nothing to snipe.')]));
    message.reply(v2([embeds.info(`Sniped — ${s.author.tag}`, s.content || '*(no content)*').setTimestamp(s.at)]));
  },
  execute({ interaction, client }) {
    const s = client.snipes.get(interaction.channel.id);
    if (!s) return interaction.reply(v2([embeds.warn('Nothing to snipe.')], { ephemeral: true }));
    interaction.reply(v2([embeds.info(`Sniped — ${s.author.tag}`, s.content || '*(no content)*')]));
  },
};
