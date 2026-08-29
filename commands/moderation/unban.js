const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'unban',
  description: 'Unban a user by ID.',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('unban').setDescription('Unban a user.')
    .addStringOption(o => o.setName('id').setDescription('User ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
  async run({ message, args }) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return message.reply(v2([embeds.error('Missing Permission', 'You need **Ban Members**.')]));
    const id = args[0];
    if (!id) return message.reply(v2([embeds.error('Usage', '`!unban <userId>`')]));
    try {
      await message.guild.bans.remove(id);
      const user = await message.client.users.fetch(id).catch(() => null);
      message.reply(v2([embeds.action({ target: user || { id, username: id }, text: 'has been unbanned.', moderator: message.author })]));
    } catch (e) { message.reply(v2([embeds.error('Failed', e.message)])); }
  },
  async execute({ interaction }) {
    const id = interaction.options.getString('id');
    try {
      await interaction.guild.bans.remove(id);
      const user = await interaction.client.users.fetch(id).catch(() => null);
      interaction.reply(v2([embeds.action({ target: user || { id, username: id }, text: 'has been unbanned.', moderator: interaction.user })]));
    } catch (e) { interaction.reply(v2([embeds.error('Failed', e.message)], { ephemeral: true })); }
  },
};
