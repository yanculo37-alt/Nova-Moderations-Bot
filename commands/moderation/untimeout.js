const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'untimeout',
  aliases: ['unmute'],
  description: 'Remove a timeout.',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('untimeout').setDescription('Remove a timeout.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
  async run({ message }) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return message.reply(v2([embeds.error('Missing Permission')]));
    const target = message.mentions.members?.first();
    if (!target) return message.reply(v2([embeds.error('Usage', '`!unmute @user`')]));
    await target.timeout(null);
    message.reply(v2([embeds.action({ target, text: 'has been unmuted.', moderator: message.author })]));
  },
  async execute({ interaction }) {
    const u = interaction.options.getUser('user');
    const m = await interaction.guild.members.fetch(u.id);
    await m.timeout(null);
    interaction.reply(v2([embeds.action({ target: m ?? u, text: 'has been unmuted.', moderator: interaction.user })]));
  },
};
