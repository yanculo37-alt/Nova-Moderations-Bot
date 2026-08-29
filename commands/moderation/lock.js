const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'lock',
  description: 'Lock the current channel.',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('lock').setDescription('Lock channel.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  async run({ message }) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels))
      return message.reply(v2([embeds.error('Missing Permission')]));
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
    message.reply(v2([embeds.success('Channel Locked', 'This channel has been locked.')]));
  },
  async execute({ interaction }) {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
    interaction.reply(v2([embeds.success('Channel Locked', 'This channel has been locked.')]));
  },
};
