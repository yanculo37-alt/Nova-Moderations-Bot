const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'say',
  description: 'Make the bot say something.',
  category: 'utility',
  data: new SlashCommandBuilder().setName('say').setDescription('Say something.')
    .addStringOption(o => o.setName('text').setDescription('Text').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
  async run({ message, args }) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    if (!args.length) return message.reply(v2([embeds.error('Usage', '`!say <text>`')]));
    await message.delete().catch(() => null);
    message.channel.send(args.join(' '));
  },
  async execute({ interaction }) {
    interaction.channel.send(interaction.options.getString('text'));
    interaction.reply(v2([embeds.success('Sent', 'Message sent.')], { ephemeral: true }));
  },
};
