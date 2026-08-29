const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');
let Warning; try { Warning = require('../../models/Warning'); } catch {}

module.exports = {
  name: 'clearwarns',
  description: 'Clear all warnings of a user.',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('clearwarns').setDescription('Clear warnings.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
  async run({ message }) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return message.reply(v2([embeds.error('Missing Permission')]));
    const target = message.mentions.users?.first();
    if (!target) return message.reply(v2([embeds.error('Usage', '`!clearwarns @user`')]));
    if (Warning) await Warning.deleteMany({ guildId: message.guild.id, userId: target.id });
    message.reply(v2([embeds.action({ target, text: 'had their warnings cleared.', moderator: message.author })]));
  },
  async execute({ interaction }) {
    const u = interaction.options.getUser('user');
    if (Warning) await Warning.deleteMany({ guildId: interaction.guild.id, userId: u.id });
    interaction.reply(v2([embeds.action({ target: u, text: 'had their warnings cleared.', moderator: interaction.user })]));
  },
};
