const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'afk',
  description: 'Set yourself AFK.',
  category: 'utility',
  data: new SlashCommandBuilder().setName('afk').setDescription('Set AFK.')
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  run({ message, args, client }) {
    const reason = args.join(' ') || 'AFK';
    client.afk.set(message.author.id, { reason, at: Date.now() });
    message.reply(v2([embeds.success('AFK set', `Reason: ${reason}`)]));
  },
  execute({ interaction, client }) {
    const reason = interaction.options.getString('reason') || 'AFK';
    client.afk.set(interaction.user.id, { reason, at: Date.now() });
    interaction.reply(v2([embeds.success('AFK set', `Reason: ${reason}`)]));
  },
};
