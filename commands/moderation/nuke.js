const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'nuke',
  description: 'Clone & delete the channel (clears all messages).',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('nuke').setDescription('Nuke this channel.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  async run({ message }) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels))
      return message.reply(v2([embeds.error('Missing Permission')]));
    const ch = message.channel;
    const pos = ch.position;
    const clone = await ch.clone();
    await clone.setPosition(pos);
    await ch.delete();
    clone.send(v2([embeds.success('Channel Nuked', 'This channel has been wiped.')]));
  },
  async execute({ interaction }) {
    const ch = interaction.channel;
    const pos = ch.position;
    const clone = await ch.clone();
    await clone.setPosition(pos);
    await ch.delete();
    clone.send(v2([embeds.success('Channel Nuked', 'This channel has been wiped.')]));
  },
};
