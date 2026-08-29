const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'poll',
  description: 'Create a yes/no poll.',
  category: 'utility',
  data: new SlashCommandBuilder().setName('poll').setDescription('Create a poll.')
    .addStringOption(o => o.setName('question').setDescription('Question').setRequired(true)),
  async run({ message, args }) {
    const q = args.join(' ');
    if (!q) return message.reply(v2([embeds.error('Usage', '`!poll <question>`')]));
    const m = await message.channel.send(v2([embeds.info('Poll', q).setFooter({ text: `By ${message.author.tag}` })]));
    await m.react('✅'); await m.react('❌');
  },
  async execute({ interaction }) {
    const q = interaction.options.getString('question');
    const m = await interaction.channel.send(v2([embeds.info('Poll', q).setFooter({ text: `By ${interaction.user.tag}` })]));
    await m.react('✅'); await m.react('❌');
    interaction.reply(v2([embeds.success('Poll Created', 'Your poll is live.')], { ephemeral: true }));
  },
};
