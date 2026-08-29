const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'slowmode',
  description: 'Set channel slowmode in seconds.',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('slowmode').setDescription('Set slowmode (seconds).')
    .addIntegerOption(o => o.setName('seconds').setDescription('0-21600').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  async run({ message, args }) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels))
      return message.reply(v2([embeds.error('Missing Permission')]));
    const s = Math.min(21600, Math.max(0, parseInt(args[0]) || 0));
    await message.channel.setRateLimitPerUser(s);
    message.reply(v2([embeds.success('Slowmode', `Set to **${s}s**.`)]));
  },
  async execute({ interaction }) {
    const s = Math.min(21600, Math.max(0, interaction.options.getInteger('seconds')));
    await interaction.channel.setRateLimitPerUser(s);
    interaction.reply(v2([embeds.success('Slowmode', `Set to **${s}s**.`)]));
  },
};
