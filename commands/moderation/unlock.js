const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'unlock',
  description: 'Unlock the current channel.',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('unlock').setDescription('Unlock channel.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  async run({ message }) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels))
      return message.reply(v2([embeds.error('Missing Permission')]));
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
    message.reply(v2([embeds.success('Channel Unlocked', 'This channel has been unlocked.')]));
  },
  async execute({ interaction }) {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
    interaction.reply(v2([embeds.success('Channel Unlocked', 'This channel has been unlocked.')]));
  },
};
