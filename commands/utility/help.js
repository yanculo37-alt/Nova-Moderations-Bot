const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'help',
  description: 'List all commands.',
  category: 'utility',
  data: new SlashCommandBuilder().setName('help').setDescription('List all commands.'),
  async run({ message, client }) {
    const grouped = {};
    client.prefixCommands.forEach(c => {
      const cat = c.category || 'misc';
      (grouped[cat] ||= []).push(`\`${c.name}\``);
    });
    const e = embeds.info('Nova Moderation — Help',
      Object.entries(grouped).map(([k, v]) => `**${k.toUpperCase()}**\n${v.join(' ')}`).join('\n\n'));
    message.reply(v2([e]));
  },
  async execute({ interaction, client }) {
    const grouped = {};
    client.prefixCommands.forEach(c => { (grouped[c.category || 'misc'] ||= []).push(`\`${c.name}\``); });
    const e = embeds.info('Nova Moderation — Help',
      Object.entries(grouped).map(([k, v]) => `**${k.toUpperCase()}**\n${v.join(' ')}`).join('\n\n'));
    interaction.reply(v2([e]));
  },
};
